import type { Aisle, ShoppingItem, ShoppingItemInput, ShoppingList } from '@/lib/shopping'
import type { TidyLine } from '@/lib/shoppingFromPlan'
import type { AppSupabaseClient } from '@/lib/supabase'
import { AppError, toAppError } from './errors'

const ITEM_COLUMNS = 'id, list_id, name, quantity, unit, aisle, checked, position'

type RawItem = Omit<ShoppingItem, 'quantity'> & { quantity: number | string | null }
const toItem = (row: RawItem): ShoppingItem => ({ ...row, quantity: row.quantity === null ? null : Number(row.quantity) })

export type ShoppingItemPatch = Partial<ShoppingItemInput & { checked: boolean; position: number }>

export function createShoppingApi(db: AppSupabaseClient) {
  return {
    /** Listes, de la plus récemment modifiée à la plus ancienne, avec leur avancement. */
    async listLists(): Promise<ShoppingList[]> {
      const { data, error } = await db
        .from('shopping_lists')
        .select('id, name, updated_at, shopping_items(checked)')
        .order('updated_at', { ascending: false })
      if (error) throw toAppError(error, 'Impossible de charger les listes de courses.')
      return data.map(({ shopping_items, ...list }) => ({
        ...list,
        total: shopping_items.length,
        checked: shopping_items.filter((i) => i.checked).length,
      }))
    },

    async getList(id: string): Promise<{ id: string; name: string } | null> {
      const { data, error } = await db.from('shopping_lists').select('id, name').eq('id', id).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger la liste.')
      return data
    },

    async createList(name: string): Promise<string> {
      const { data, error } = await db.from('shopping_lists').insert({ name: name.trim() }).select('id').single()
      if (error) throw toAppError(error, 'Impossible de créer la liste.')
      return data.id
    },

    async renameList(id: string, name: string): Promise<void> {
      const { error } = await db.from('shopping_lists').update({ name: name.trim() }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de renommer la liste.')
    },

    async deleteList(id: string): Promise<void> {
      const { error } = await db.from('shopping_lists').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer la liste.')
    },

    async listItems(listId: string): Promise<ShoppingItem[]> {
      const { data, error } = await db.from('shopping_items').select(ITEM_COLUMNS).eq('list_id', listId).order('position').order('name')
      if (error) throw toAppError(error, 'Impossible de charger les articles.')
      return data.map(toItem)
    },

    async addItem(listId: string, input: ShoppingItemInput, position: number): Promise<ShoppingItem> {
      const { data, error } = await db
        .from('shopping_items')
        .insert({ ...input, list_id: listId, position })
        .select(ITEM_COLUMNS)
        .single()
      if (error) throw toAppError(error, "Impossible d'ajouter l'article.")
      return toItem(data)
    },

    /** Ajoute plusieurs articles en une requête, à partir de la position `start`. */
    async addItems(listId: string, inputs: ShoppingItemInput[], start: number): Promise<void> {
      if (inputs.length === 0) return
      const rows = inputs.map((input, i) => ({ ...input, list_id: listId, position: start + i }))
      const { error } = await db.from('shopping_items').insert(rows)
      if (error) throw toAppError(error, "Impossible d'ajouter les articles.")
    },

    /** Nettoyage par le modèle (Edge Function tidy-shopping) : nom canonique, rayon, basique du placard. */
    async tidy(lines: { id: string; name: string; quantity: number | null; unit: string | null; aisle: Aisle }[]): Promise<TidyLine[]> {
      const { data, error } = await db.functions.invoke<{ lines: TidyLine[] }>('tidy-shopping', { body: { lines } })
      if (error || !Array.isArray(data?.lines)) throw new AppError('Regroupement automatique indisponible.')
      return data.lines
    },

    async updateItem(id: string, patch: ShoppingItemPatch): Promise<void> {
      const { error } = await db.from('shopping_items').update(patch).eq('id', id)
      if (error) throw toAppError(error, "Impossible de modifier l'article.")
    },

    async deleteItem(id: string): Promise<void> {
      const { error } = await db.from('shopping_items').delete().eq('id', id)
      if (error) throw toAppError(error, "Impossible de supprimer l'article.")
    },

    /** Retire de la liste les articles déjà dans le caddie. */
    async clearChecked(listId: string): Promise<void> {
      const { error } = await db.from('shopping_items').delete().eq('list_id', listId).eq('checked', true)
      if (error) throw toAppError(error, 'Impossible de retirer les articles cochés.')
    },

    subscribe(onChange: () => void, onStatus?: (status: string) => void): () => void {
      const channel = db.channel(`shopping-${Math.random().toString(36).slice(2)}`)
      for (const table of ['shopping_lists', 'shopping_items']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      }
      channel.subscribe((status) => onStatus?.(status))
      return () => {
        void db.removeChannel(channel)
      }
    },
  }
}

export type ShoppingApi = ReturnType<typeof createShoppingApi>

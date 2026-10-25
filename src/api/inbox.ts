import type { IsoDate } from '@/lib/dates'
import type { InboxItem } from '@/lib/inbox'
import type { MealSlot } from '@/lib/meals'
import type { AppSupabaseClient } from '@/lib/supabase'
import { AppError, toAppError } from './errors'

export function createInboxApi(db: AppSupabaseClient) {
  return {
    async listItems(): Promise<InboxItem[]> {
      const { data, error } = await db.from('planning_inbox').select('id, title, url, recipe_id, created_at').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger la liste à planifier.')
      return data
    },

    /** Ajoute un lien, une idée ou une recette enregistrée ; un lien déjà enregistré devient la recette. */
    async addItem(input: { title?: string; url?: string; recipeId?: string }): Promise<string> {
      const { data, error } = await db.rpc('add_to_inbox', { p_title: input.title, p_url: input.url, p_recipe_id: input.recipeId })
      if (error?.code === '23505') throw new AppError('Déjà dans la liste « À planifier ».', error.code)
      if (error) throw toAppError(error, "Impossible d'ajouter à la liste.")
      return data
    },

    async renameItem(id: string, title: string): Promise<void> {
      const { error } = await db.from('planning_inbox').update({ title: title.trim() }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de renommer.')
    },

    async deleteItem(id: string): Promise<void> {
      const { error } = await db.from('planning_inbox').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de retirer de la liste.')
    },

    /** Crée le repas et retire l'élément de la liste ; renvoie l'id du repas. */
    async planItem(id: string, date: IsoDate, slot: MealSlot, people: string[]): Promise<string> {
      const { data, error } = await db.rpc('plan_inbox_item', { p_item_id: id, p_meal_date: date, p_slot: slot, p_people: people })
      if (error) throw toAppError(error, 'Impossible de planifier ce repas.')
      return data
    },

    /** Titre de la page d'un lien (sans modèle) ; null si indisponible. */
    async fetchTitle(url: string): Promise<string | null> {
      const { data, error } = await db.functions.invoke<{ title: string | null }>('import-recipe', { body: { url, mode: 'title' } })
      if (error || typeof data?.title !== 'string') return null
      return data.title.trim() || null
    },

    subscribe(onChange: () => void, onStatus?: (status: string) => void): () => void {
      const channel = db
        .channel(`inbox-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_inbox' }, onChange)
        .subscribe((status) => onStatus?.(status))
      return () => {
        void db.removeChannel(channel)
      }
    },
  }
}

export type InboxApi = ReturnType<typeof createInboxApi>

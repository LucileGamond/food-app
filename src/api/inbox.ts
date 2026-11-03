import type { IsoDate } from '@/lib/dates'
import type { InboxItem, InboxList } from '@/lib/inbox'
import type { MealSlot } from '@/lib/meals'
import type { AppSupabaseClient } from '@/lib/supabase'
import { AppError, toAppError } from './errors'
import { PENDING_PHOTO_PREFIX, PHOTO_BUCKET } from './photos'
import { subscribeTables } from './realtime'

export function createInboxApi(db: AppSupabaseClient) {
  /** Retire des photos en attente du stockage ; un échec laisse un fichier orphelin, sans gêner l'application. */
  async function removePhotos(paths: string[]): Promise<void> {
    if (paths.length > 0) await db.storage.from(PHOTO_BUCKET).remove(paths)
  }

  return {
    async listItems(list: InboxList = 'plan'): Promise<InboxItem[]> {
      const { data, error } = await db.from('planning_inbox').select('id, title, url, recipe_id, created_at, list, photos').eq('list', list).order('created_at')
      if (error) throw toAppError(error, list === 'aside' ? 'Impossible de charger les recettes mises de côté.' : 'Impossible de charger la liste à planifier.')
      return data
    },

    /**
     * Ajoute un lien, une idée, une recette enregistrée ou des photos déjà envoyées (`uploadPhotos`) à une liste ;
     * un lien déjà enregistré devient la recette.
     */
    async addItem(input: { title?: string; url?: string; recipeId?: string; list?: InboxList; photos?: string[] }): Promise<string> {
      const { data, error } = await db.rpc('add_to_inbox', {
        p_title: input.title,
        p_url: input.url,
        p_recipe_id: input.recipeId,
        ...(input.list ? { p_list: input.list } : {}),
        ...(input.photos?.length ? { p_photos: input.photos } : {}),
      })
      // Un lien n'est que dans une liste à la fois.
      if (error?.code === '23505') throw new AppError('Déjà dans « À planifier » ou « De côté ».', error.code)
      if (error) throw toAppError(error, "Impossible d'ajouter à la liste.")
      return data
    },

    /** Envoie des photos (déjà réduites) en attente d'être lues ; renvoie leurs chemins pour `addItem`. */
    async uploadPhotos(photos: Blob[]): Promise<string[]> {
      const paths: string[] = []
      for (const photo of photos) {
        const path = `${PENDING_PHOTO_PREFIX}${crypto.randomUUID()}.jpg`
        const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg' })
        if (error) {
          await removePhotos(paths)
          throw toAppError(null, "Impossible d'envoyer les photos.")
        }
        paths.push(path)
      }
      return paths
    },

    /** Photos en attente, relues pour préremplir la recette. */
    async downloadPhotos(paths: string[]): Promise<File[]> {
      return Promise.all(
        paths.map(async (path, i) => {
          const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path)
          if (error || !data) throw toAppError(null, 'Impossible de récupérer les photos mises de côté.')
          return new File([data], `page-${i + 1}.jpg`, { type: data.type || 'image/jpeg' })
        }),
      )
    },

    removePhotos,

    /** Passe un élément dans l'autre liste (« De côté » → « À planifier »…). */
    async moveItem(id: string, list: InboxList): Promise<void> {
      const { error } = await db.from('planning_inbox').update({ list }).eq('id', id)
      if (error) throw toAppError(error, 'Impossible de déplacer cet élément.')
    },

    /** Recette enregistrée depuis un élément : il devient la recette (« À planifier ») ou disparaît (« De côté »). */
    async resolveItem(id: string, recipeId: string): Promise<void> {
      const { data, error } = await db.rpc('resolve_inbox_item', { p_item_id: id, p_recipe_id: recipeId })
      if (error) throw toAppError(error, 'La recette est enregistrée, mais la liste n’a pas pu être mise à jour.')
      await removePhotos(data ?? []).catch(() => undefined)
    },

    /** Renomme ; avec `ifTitle`, seulement si le titre n'a pas changé entre-temps (renommage à la main). */
    async renameItem(id: string, title: string, ifTitle?: string): Promise<void> {
      let query = db.from('planning_inbox').update({ title: title.trim().slice(0, 200) }).eq('id', id)
      if (ifTitle !== undefined) query = query.eq('title', ifTitle)
      const { error } = await query
      if (error) throw toAppError(error, 'Impossible de renommer.')
    },

    /** Retire un élément, et ses photos du stockage. */
    async deleteItem(id: string, photos: string[] = []): Promise<void> {
      const { error } = await db.from('planning_inbox').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de retirer de la liste.')
      await removePhotos(photos).catch(() => undefined)
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

    subscribe: (onChange: () => void, onStatus?: (status: string) => void) => subscribeTables(db, 'inbox', ['planning_inbox'], onChange, onStatus),
  }
}

export type InboxApi = ReturnType<typeof createInboxApi>

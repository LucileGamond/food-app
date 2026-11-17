// Stock de laine, idées gardées pour un ensemble de laines, fiches de mesures.

import { toAppError } from '@/api/errors'
import type { Json } from '@/lib/database.types'
import { ideasFromJson, ideasKey, yarnFromJson, type StashIdeas, type StashItem, type Yarn, type YarnIdea } from '../lib/yarn'
import type { MeasureProfile } from '../lib/sizeAdvice'
import { sameSet, type KnitContext } from './shared'

export function stashApi({ db }: KnitContext) {
  return {
    async listStash(): Promise<StashItem[]> {
      const { data, error } = await db.from('knit_stash').select('id, yarn, notes, created_at').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger le stock de laine.')
      return data.map((r) => ({ id: r.id, yarn: yarnFromJson(r.yarn), notes: r.notes, createdAt: r.created_at }))
    },

    /** Ajoute (sans `id`) ou modifie une laine du stock. */
    async saveStashItem(input: { id: string | null; yarn: Yarn; notes: string }): Promise<void> {
      const yarn = Object.fromEntries(Object.entries(input.yarn).filter(([, v]) => v !== null)) as unknown as NonNullable<Json>
      const { error } = input.id
        ? await db.from('knit_stash').update({ yarn, notes: input.notes, updated_at: new Date().toISOString() }).eq('id', input.id)
        : await db.from('knit_stash').insert({ yarn, notes: input.notes })
      if (error) throw toAppError(error, 'Impossible d’enregistrer la laine.')
    },

    async deleteStashItem(id: string): Promise<void> {
      const { error } = await db.from('knit_stash').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de retirer la laine.')
    },

    /** Idées gardées pour cet ensemble de laines du stock, s'il y en a. */
    async getStashIdeas(stashIds: string[]): Promise<StashIdeas | null> {
      const query = db.from('knit_stash_ideas').select('stash_ids, wish, ideas, weight, updated_at')
      const { data, error } = await sameSet(query, 'stash_ids', ideasKey(stashIds)).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger les idées gardées.')
      if (!data) return null
      // La base garantit au moins une idée par ligne.
      return { stashIds: data.stash_ids, wish: data.wish, ideas: ideasFromJson(data.ideas), weight: data.weight, updatedAt: data.updated_at }
    },

    /** Garde (ou remplace) les idées d'un ensemble de laines du stock. */
    async saveStashIdeas(input: { stashIds: string[]; wish: string; ideas: YarnIdea[]; weight: string | null }): Promise<void> {
      const key = ideasKey(input.stashIds)
      const ideas = input.ideas as unknown as NonNullable<Json>
      const row = { wish: input.wish.trim(), ideas, weight: input.weight }
      const { data: existing, error: readError } = await sameSet(db.from('knit_stash_ideas').select('id'), 'stash_ids', key).maybeSingle()
      if (readError) throw toAppError(readError, 'Impossible de garder les idées.')
      const { error } = existing
        ? await db.from('knit_stash_ideas').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await db.from('knit_stash_ideas').insert({ ...row, stash_ids: key })
      if (error) throw toAppError(error, 'Impossible de garder les idées.')
    },

    /** Fiches de mesures (la sienne, celles des proches). */
    async listMeasures(): Promise<MeasureProfile[]> {
      const { data, error } = await db.from('knit_measures').select('id, name, chest, waist, hip, arm, head').order('created_at')
      if (error) throw toAppError(error, 'Impossible de charger les fiches de mesures.')
      return data.map(({ id, name, ...m }) => ({ id, name, measures: { chest: m.chest, waist: m.waist, hip: m.hip, arm: m.arm, head: m.head } }))
    },

    /** Ajoute (sans `id`) ou modifie une fiche de mesures. */
    async saveMeasures(input: { id: string | null; name: string; measures: MeasureProfile['measures'] }): Promise<void> {
      const row = { name: input.name.trim(), ...input.measures }
      const { error } = input.id
        ? await db.from('knit_measures').update({ ...row, updated_at: new Date().toISOString() }).eq('id', input.id)
        : await db.from('knit_measures').insert(row)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la fiche de mesures.')
    },

    async deleteMeasures(id: string): Promise<void> {
      const { error } = await db.from('knit_measures').delete().eq('id', id)
      if (error) throw toAppError(error, 'Impossible de supprimer la fiche de mesures.')
    },
  }
}

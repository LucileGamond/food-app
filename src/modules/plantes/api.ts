// Module Plantes : fiches, photos, règles d'arrosage et historique. Partagés par le foyer.

import { AppError, toAppError } from '@/api/errors'
import { subscribeTables } from '@/api/realtime'
import type { Json } from '@/lib/database.types'
import type { AppSupabaseClient } from '@/lib/supabase'
import type { Plant, PlantInput, PlantPhoto, RuleInput, WateringEvent } from './lib/plants'

const PLANT_PHOTO_BUCKET = 'plant-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const PLANT_COLUMNS = `
  id, name, species, location, planted_on, planted_height_cm, pot_diameter_cm, notes, archived_at, created_at,
  photos:plant_photos(id, storage_path, position),
  rules:watering_rules(id, months, first_watering_on, interval_count, interval_unit, amount_ml, note)
`
const EVENT_COLUMNS = 'id, plant_id, rule_id, scheduled_on, watered_at, amount_ml, done_by, note'

export interface WaterInput {
  plantId: string
  /** Échéance couverte ; null = arrosage hors planning. */
  scheduledOn: string | null
  ruleId: string | null
  amountMl: number | null
}

export function createPlantsApi(db: AppSupabaseClient) {
  return {
    /** Toutes les plantes (archivées comprises), par nom. */
    async listPlants(): Promise<Plant[]> {
      const { data, error } = await db.from('plants').select(PLANT_COLUMNS).order('name')
      if (error) throw toAppError(error, 'Impossible de charger les plantes.')
      return data
    },

    async getPlant(id: string): Promise<Plant | null> {
      const { data, error } = await db.from('plants').select(PLANT_COLUMNS).eq('id', id).maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger la plante.')
      return data
    },

    /** Crée ou met à jour une plante et remplace ses règles (une transaction côté base) ; renvoie son id. */
    async savePlant(plant: PlantInput, rules: RuleInput[], id?: string): Promise<string> {
      const { data, error } = await db.rpc('save_plant', {
        p_plant: plant as unknown as Json,
        p_rules: rules as unknown as Json,
        ...(id ? { p_plant_id: id } : {}),
      })
      if (error?.code === '23P01') throw new AppError('Deux règles couvrent le même mois.', error.code)
      if (error) throw toAppError(error, 'Impossible d’enregistrer la plante.')
      return data
    },

    async setArchived(id: string, archived: boolean): Promise<void> {
      const { error } = await db
        .from('plants')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw toAppError(error, archived ? 'Impossible d’archiver la plante.' : 'Impossible de réactiver la plante.')
    },

    /** Supprime la plante, ses règles, son historique et ses photos. */
    async deletePlant(plant: Pick<Plant, 'id' | 'photos'>): Promise<void> {
      const { error } = await db.from('plants').delete().eq('id', plant.id)
      if (error) throw toAppError(error, 'Impossible de supprimer la plante.')
      // Un fichier qui resterait est supprimé par le ménage de nuit.
      if (plant.photos.length > 0) await db.storage.from(PLANT_PHOTO_BUCKET).remove(plant.photos.map((p) => p.storage_path))
    },

    /** Arrosages, du plus récent au plus ancien : depuis une date, ou d'une plante. */
    async listEvents(filter: { since?: string; plantId?: string } = {}): Promise<WateringEvent[]> {
      let query = db.from('watering_events').select(EVENT_COLUMNS).order('watered_at', { ascending: false })
      if (filter.since) query = query.gte('watered_at', filter.since)
      if (filter.plantId) query = query.eq('plant_id', filter.plantId)
      const { data, error } = await query
      if (error) throw toAppError(error, 'Impossible de charger l’historique d’arrosage.')
      return data
    },

    /** Note un arrosage par la personne connectée. */
    async water(input: WaterInput): Promise<WateringEvent> {
      const { data, error } = await db
        .from('watering_events')
        .insert({ plant_id: input.plantId, scheduled_on: input.scheduledOn, rule_id: input.ruleId, amount_ml: input.amountMl })
        .select(EVENT_COLUMNS)
        .single()
      if (error?.code === '23505') throw new AppError('Cet arrosage a déjà été noté, peut-être par quelqu’un d’autre.', error.code)
      if (error) throw toAppError(error, 'Impossible d’enregistrer l’arrosage.')
      return data
    },

    /** Annule un arrosage noté par erreur : l'échéance redevient à faire. */
    async undoWatering(eventId: string): Promise<void> {
      const { error } = await db.from('watering_events').delete().eq('id', eventId)
      if (error) throw toAppError(error, 'Impossible d’annuler l’arrosage.')
    },

    /** Envoie une photo (déjà réduite) et l'ajoute après les autres. */
    async uploadPhoto(plantId: string, file: Blob): Promise<PlantPhoto> {
      const extension = EXTENSIONS[file.type]
      if (!extension) throw new AppError('Format de photo non pris en charge (JPEG, PNG ou WebP).')
      const path = `${plantId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await db.storage.from(PLANT_PHOTO_BUCKET).upload(path, file, { contentType: file.type })
      if (uploadError) throw toAppError(null, 'Impossible d’envoyer la photo.')

      const { data: last, error: lastError } = await db
        .from('plant_photos')
        .select('position')
        .eq('plant_id', plantId)
        .order('position', { ascending: false })
        .limit(1)
      if (lastError) throw toAppError(lastError, 'Impossible d’enregistrer la photo.')
      const { data, error } = await db
        .from('plant_photos')
        .insert({ plant_id: plantId, storage_path: path, position: (last[0]?.position ?? -1) + 1 })
        .select('id, storage_path, position')
        .single()
      if (error) {
        await db.storage.from(PLANT_PHOTO_BUCKET).remove([path])
        throw toAppError(error, 'Impossible d’enregistrer la photo.')
      }
      return data
    },

    async deletePhoto(photo: Pick<PlantPhoto, 'id' | 'storage_path'>): Promise<void> {
      const { error } = await db.from('plant_photos').delete().eq('id', photo.id)
      if (error) throw toAppError(error, 'Impossible de supprimer la photo.')
      await db.storage.from(PLANT_PHOTO_BUCKET).remove([photo.storage_path])
    },

    /** Réordonne les photos : la première devient la photo principale. */
    async reorderPhotos(orderedIds: string[]): Promise<void> {
      const results = await Promise.all(orderedIds.map((id, position) => db.from('plant_photos').update({ position }).eq('id', id)))
      const failed = results.find((r) => r.error)
      if (failed?.error) throw toAppError(failed.error, 'Impossible de changer l’ordre des photos.')
    },

    /** URL temporaires des photos du bucket privé. */
    async signedUrls(paths: string[]): Promise<Record<string, string>> {
      if (paths.length === 0) return {}
      const { data, error } = await db.storage.from(PLANT_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      if (error) throw toAppError(null, 'Impossible de charger les photos.')
      const urls: Record<string, string> = {}
      for (const item of data) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
      return urls
    },

    /** Plantes, règles ou arrosages modifiés ailleurs (autre appareil, autre personne). */
    subscribe: (onChange: () => void, onStatus?: (status: string) => void) =>
      subscribeTables(db, 'plants', ['plants', 'watering_rules', 'watering_events'], onChange, onStatus),
  }
}

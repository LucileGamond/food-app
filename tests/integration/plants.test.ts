import { AppError, createApi } from '@/api'
import type { PlantInput, RuleInput } from '@/modules/plantes/lib/plants'
import { ERIC, LUCILE, PNG_1PX, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

const PLANT: PlantInput = { name: 'Cactus', species: 'Echinocactus grusonii', location: 'Salon', planted_on: '2026-04-01', planted_height_cm: 12.5, pot_diameter_cm: null, notes: null }
const WEEKLY = (first: string): RuleInput => ({ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], first_watering_on: first, interval_count: 1, interval_unit: 'week', amount_ml: 250, note: null })

describe('plantes', () => {
  it('crée une plante avec ses règles, la relit, puis la modifie', async () => {
    const { api } = await signedInApi()
    const id = await api.plants.savePlant(PLANT, [
      { months: [6, 7, 8], first_watering_on: '2026-06-05', interval_count: 1, interval_unit: 'month', amount_ml: 1000, note: 'Eau de pluie' },
      { months: [11, 12, 1, 2], first_watering_on: '2026-11-15', interval_count: 6, interval_unit: 'week', amount_ml: 200, note: null },
    ])

    const plant = await api.plants.getPlant(id)
    expect(plant).toMatchObject({ id, name: 'Cactus', location: 'Salon', planted_height_cm: 12.5, archived_at: null, photos: [] })
    expect(plant!.rules.map((r) => r.months).sort()).toEqual([[1, 2, 11, 12], [6, 7, 8]])

    await api.plants.savePlant({ ...PLANT, name: 'Grand cactus' }, [WEEKLY('2026-10-01')], id)
    const updated = await api.plants.getPlant(id)
    expect(updated!.name).toBe('Grand cactus')
    expect(updated!.rules).toHaveLength(1)
  })

  it('refuse des règles qui se chevauchent, sans rien enregistrer', async () => {
    const { api } = await signedInApi()
    await expect(api.plants.savePlant(PLANT, [WEEKLY('2026-10-01'), WEEKLY('2026-10-02')])).rejects.toThrow('Deux règles couvrent le même mois.')
    expect(await api.plants.listPlants()).toEqual([])
  })

  it('liste triée par nom, partagée par le foyer', async () => {
    const { api } = await signedInApi()
    await api.plants.savePlant({ ...PLANT, name: 'Ficus' }, [])
    await api.plants.savePlant({ ...PLANT, name: 'Basilic' }, [])
    const { api: eric } = await signedInApi(ERIC.email)
    expect((await eric.plants.listPlants()).map((p) => p.name)).toEqual(['Basilic', 'Ficus'])
  })

  it('archive et réactive', async () => {
    const { api } = await signedInApi()
    const id = await api.plants.savePlant(PLANT, [])
    await api.plants.setArchived(id, true)
    expect((await api.plants.getPlant(id))!.archived_at).not.toBeNull()
    await api.plants.setArchived(id, false)
    expect((await api.plants.getPlant(id))!.archived_at).toBeNull()
  })

  it('plante inconnue', async () => {
    const { api } = await signedInApi()
    expect(await api.plants.getPlant('00000000-0000-0000-0000-000000000000')).toBeNull()
    await expect(api.plants.savePlant(PLANT, [], '00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(AppError)
  })

  it('personne non connectée : rien n’est accessible', async () => {
    const api = createApi(anonClient())
    await expect(api.plants.listPlants()).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.getPlant('x')).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.savePlant(PLANT, [])).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.setArchived('x', true)).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.setArchived('x', false)).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.deletePlant({ id: 'x', photos: [] })).rejects.toBeInstanceOf(AppError)
  })
})

describe('photos de plantes', () => {
  it('ajoute, réordonne, affiche puis supprime avec la plante', async () => {
    const { api, db } = await signedInApi()
    const id = await api.plants.savePlant(PLANT, [])
    const first = await api.plants.uploadPhoto(id, PNG_1PX)
    const second = await api.plants.uploadPhoto(id, PNG_1PX)
    expect([first.position, second.position]).toEqual([0, 1])
    expect(first.storage_path).toMatch(new RegExp(`^${id}/[0-9a-f-]+\\.png$`))

    await api.plants.reorderPhotos([second.id, first.id])
    const plant = await api.plants.getPlant(id)
    expect(plant!.photos.find((p) => p.id === second.id)!.position).toBe(0)

    const urls = await api.plants.signedUrls([first.storage_path])
    expect(urls[first.storage_path]).toMatch(/^http/)
    expect(await api.plants.signedUrls([])).toEqual({})

    await api.plants.deletePhoto(first)
    await api.plants.deletePlant(plant!)
    expect(await api.plants.getPlant(id)).toBeNull()
    const { data } = await db.storage.from('plant-photos').list(id)
    expect(data).toEqual([])
  })

  it('refuse un format non pris en charge', async () => {
    const { api } = await signedInApi()
    const id = await api.plants.savePlant(PLANT, [])
    await expect(api.plants.uploadPhoto(id, new Blob(['x'], { type: 'image/gif' }))).rejects.toThrow('Format de photo non pris en charge')
  })

  it('photo pour une plante inconnue : rien ne reste dans le stockage', async () => {
    const { api, db } = await signedInApi()
    const ghost = '00000000-0000-0000-0000-000000000000'
    await expect(api.plants.uploadPhoto(ghost, PNG_1PX)).rejects.toBeInstanceOf(AppError)
    const { data } = await db.storage.from('plant-photos').list(ghost)
    expect(data).toEqual([])
  })

  it('erreurs de stockage', async () => {
    const api = createApi(anonClient())
    await expect(api.plants.uploadPhoto('x', PNG_1PX)).rejects.toThrow('Impossible d’envoyer la photo.')
    // Lien refusé par le stockage : pas de photo, sans erreur.
    expect(await api.plants.signedUrls(['x/y.png'])).toEqual({})
    await expect(api.plants.deletePhoto({ id: 'x', storage_path: 'x' })).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.reorderPhotos(['x'])).rejects.toBeInstanceOf(AppError)
  })
})

describe('arrosages', () => {
  it('note qui a arrosé, quand et combien ; visible par tout le foyer', async () => {
    const { api } = await signedInApi(LUCILE.email)
    const plantId = await api.plants.savePlant(PLANT, [WEEKLY('2026-10-01')])
    const plant = await api.plants.getPlant(plantId)

    const event = await api.plants.water({ plantId, scheduledOn: '2026-10-22', ruleId: plant!.rules[0]!.id, amountMl: 250 })
    expect(event).toMatchObject({ plant_id: plantId, scheduled_on: '2026-10-22', amount_ml: 250, done_by: LUCILE.id })

    const { api: eric } = await signedInApi(ERIC.email)
    expect((await eric.plants.listEvents({ plantId })).map((e) => e.done_by)).toEqual([LUCILE.id])
  })

  it('une échéance ne peut être notée qu’une fois (même par deux personnes)', async () => {
    const { api } = await signedInApi(LUCILE.email)
    const plantId = await api.plants.savePlant(PLANT, [WEEKLY('2026-10-01')])
    await api.plants.water({ plantId, scheduledOn: '2026-10-22', ruleId: null, amountMl: 250 })
    const { api: eric } = await signedInApi(ERIC.email)
    await expect(eric.plants.water({ plantId, scheduledOn: '2026-10-22', ruleId: null, amountMl: 250 })).rejects.toThrow(
      'Cet arrosage a déjà été noté, peut-être par quelqu’un d’autre.',
    )
  })

  it('filtre par date et par plante, du plus récent au plus ancien, et annule', async () => {
    const { api } = await signedInApi()
    const a = await api.plants.savePlant({ ...PLANT, name: 'A' }, [])
    const b = await api.plants.savePlant({ ...PLANT, name: 'B' }, [])
    const first = await api.plants.water({ plantId: a, scheduledOn: null, ruleId: null, amountMl: null })
    const second = await api.plants.water({ plantId: b, scheduledOn: null, ruleId: null, amountMl: 100 })

    expect((await api.plants.listEvents()).map((e) => e.id)).toEqual([second.id, first.id])
    expect((await api.plants.listEvents({ plantId: a })).map((e) => e.id)).toEqual([first.id])
    expect(await api.plants.listEvents({ since: new Date(Date.now() + 60_000).toISOString() })).toEqual([])

    await api.plants.undoWatering(first.id)
    expect((await api.plants.listEvents()).map((e) => e.id)).toEqual([second.id])
  })

  it('prévient en temps réel quand quelqu’un d’autre arrose', async () => {
    const { api } = await signedInApi(LUCILE.email)
    const plantId = await api.plants.savePlant(PLANT, [])
    let changes = 0
    let status = ''
    const unsubscribe = api.plants.subscribe(
      () => changes++,
      (s) => (status = s),
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      // Diffusion parfois lente juste après le démarrage : on réessaie tant qu'aucun changement n'est reçu.
      const { api: eric } = await signedInApi(ERIC.email)
      for (let attempt = 0; attempt < 4 && changes === 0; attempt++) {
        await eric.plants.water({ plantId, scheduledOn: null, ruleId: null, amountMl: null })
        await waitFor(() => changes > 0, 5000).catch(() => undefined)
      }
      expect(changes).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60_000)

  it('erreurs remontées en AppError', async () => {
    const api = createApi(anonClient())
    await expect(api.plants.listEvents()).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.water({ plantId: 'x', scheduledOn: null, ruleId: null, amountMl: null })).rejects.toBeInstanceOf(AppError)
    await expect(api.plants.undoWatering('x')).rejects.toBeInstanceOf(AppError)
  })
})

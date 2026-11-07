import { createAppClient } from '@/api/client'
import { AppError } from '@/api'
import { ERIC, LOCAL_SERVICE_KEY, LOCAL_URL, LUCILE, resetData, signedInApi, waitFor } from './helpers'

const SECRET_URL = 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-abc/basic.ics'
const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })

/** Synchronisation simulée (serveur) : les occurrences d'une source. */
async function replaceEvents(sourceId: string, events: unknown[]) {
  const { error } = await admin.rpc('replace_calendar_events', { p_source_id: sourceId, p_events: events as never })
  if (error) throw error
}

beforeEach(async () => {
  await resetData()
})

describe('agenda api', () => {
  it('ajoute un agenda Google, visible par le foyer sans son adresse secrète', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await lucile.api.agenda.addIcalSource('Perso', SECRET_URL)

    const sources = await eric.api.agenda.listSources()
    expect(sources).toEqual([{ id, ownerId: LUCILE.id, ownerName: 'Lucile', provider: 'ical', name: 'Perso', lastSyncedAt: null, lastError: null }])
    expect(JSON.stringify(sources)).not.toContain('private-abc')
    const { error } = await lucile.db.from('calendar_source_credentials' as never).select('*')
    expect(error).not.toBeNull()
  })

  it('refuse une adresse qui n’est pas celle d’un agenda Google', async () => {
    const { api } = await signedInApi()
    await expect(api.agenda.addIcalSource('Pirate', 'https://evil.test/basic.ics')).rejects.toThrow('Adresse ou nom refusé')
    await expect(api.agenda.addIcalSource('', SECRET_URL)).rejects.toBeInstanceOf(AppError)
  })

  it('liste les rendez-vous et journées entières qui touchent la période, avec leur propriétaire', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const mine = await lucile.api.agenda.addIcalSource('Perso', SECRET_URL)
    const his = await eric.api.agenda.addIcalSource('Travail', SECRET_URL.replace('lucile', 'eric'))
    await replaceEvents(mine, [
      { uid: 'dentiste', title: 'Dentiste', location: 'Lyon', allDay: false, startsAt: '2026-11-10T08:00:00Z', endsAt: '2026-11-10T09:00:00Z' },
      { uid: 'vacances', title: 'Vacances', location: null, allDay: true, startDate: '2026-11-08', endDate: '2026-11-11' },
      { uid: 'loin', title: 'Plus tard', location: null, allDay: false, startsAt: '2026-12-10T08:00:00Z', endsAt: '2026-12-10T09:00:00Z' },
    ])
    await replaceEvents(his, [{ uid: 'reunion', title: 'Réunion', location: null, allDay: false, startsAt: '2026-11-12T13:00:00Z', endsAt: '2026-11-12T14:00:00Z' }])

    const events = await lucile.api.agenda.listEvents('2026-11-10', '2026-11-16')
    expect(events.map((e) => e.title).sort()).toEqual(['Dentiste', 'Réunion', 'Vacances'])
    expect(events.find((e) => e.title === 'Dentiste')).toMatchObject({ sourceId: mine, ownerId: LUCILE.id, ownerName: 'Lucile', location: 'Lyon', allDay: false, startsAt: '2026-11-10T08:00:00+00:00' })
    expect(events.find((e) => e.title === 'Vacances')).toMatchObject({ allDay: true, startDate: '2026-11-08', endDate: '2026-11-11' })
    expect(events.find((e) => e.title === 'Réunion')).toMatchObject({ ownerId: ERIC.id, ownerName: 'Eric' })
    expect(await lucile.api.agenda.listEvents('2026-11-25', '2026-11-26')).toEqual([])
  })

  it('chacun ne retire que ses agendas ; leurs rendez-vous disparaissent', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await lucile.api.agenda.addIcalSource('Perso', SECRET_URL)
    await replaceEvents(id, [{ uid: 'a', title: 'Dentiste', location: null, allDay: false, startsAt: '2026-11-10T08:00:00Z', endsAt: '2026-11-10T09:00:00Z' }])

    await eric.api.agenda.deleteSource(id)
    expect(await lucile.api.agenda.listSources()).toHaveLength(1)
    await lucile.api.agenda.deleteSource(id)
    expect(await lucile.api.agenda.listSources()).toEqual([])
    expect(await lucile.api.agenda.listEvents('2026-11-10', '2026-11-10')).toEqual([])
  })

  it('synchroniser tout de suite : la fonction sync-calendars, erreur lisible sinon', async () => {
    const { db, api } = await signedInApi()
    // `db.functions` est recréé à chaque accès : on simule la méthode de sa classe.
    const invoke = vi.spyOn(Object.getPrototypeOf(db.functions) as typeof db.functions, 'invoke')
    invoke.mockResolvedValueOnce({ data: { synced: 1, failed: 0 }, error: null, response: undefined } as never)
    await api.agenda.syncNow()
    expect(invoke).toHaveBeenCalledWith('sync-calendars', { body: {} })
    invoke.mockResolvedValueOnce({ data: null, error: new Error('indisponible'), response: undefined } as never)
    await expect(api.agenda.syncNow()).rejects.toThrow('Synchronisation impossible pour le moment.')
    invoke.mockRestore()
  })

  it('suit les synchronisations (temps réel)', async () => {
    const lucile = await signedInApi()
    const id = await lucile.api.agenda.addIcalSource('Perso', SECRET_URL)
    let changes = 0
    let status = ''
    const unsubscribe = lucile.api.agenda.subscribe(
      () => {
        changes += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      const deadline = Date.now() + 30000
      while (changes === 0 && Date.now() < deadline) {
        await replaceEvents(id, [])
        await waitFor(() => changes > 0, 2000).catch(() => undefined)
      }
      expect(changes).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)

  it('erreurs de la base : message lisible', async () => {
    const { db, api } = await signedInApi()
    // Requêtes qui échouent (base indisponible), quelle que soit la chaîne de filtres.
    const failed = { data: null, error: { message: 'indisponible', code: 'XX000' } }
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'eq', 'lt', 'gte', 'lte', 'gt', 'delete']) query[method] = () => query
    query.then = (resolve: (value: typeof failed) => void) => resolve(failed)
    vi.spyOn(db, 'from').mockReturnValue(query as never)
    await expect(api.agenda.listSources()).rejects.toThrow('Impossible de charger les agendas.')
    await expect(api.agenda.listEvents('2026-11-10', '2026-11-10')).rejects.toThrow('Impossible de charger l’agenda.')
    await expect(api.agenda.deleteSource('x')).rejects.toThrow('Impossible de supprimer l’agenda.')
    // Journées entières en échec seulement
    let calls = 0
    query.then = (resolve: (value: unknown) => void) => resolve(++calls % 2 === 1 ? { data: [], error: null } : failed)
    await expect(api.agenda.listEvents('2026-11-10', '2026-11-10')).rejects.toThrow('Impossible de charger l’agenda.')
    vi.spyOn(db, 'rpc').mockResolvedValue(failed as never)
    await expect(api.agenda.addIcalSource('Perso', SECRET_URL)).rejects.toThrow('Impossible d’ajouter l’agenda.')
  })
})

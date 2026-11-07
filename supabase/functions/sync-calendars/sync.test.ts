import type { CalendarOccurrence } from '../_shared/agenda/occurrence.ts'
import { CalendarSyncError, type CalendarProvider, type IcalCredentials } from '../_shared/agenda/provider.ts'
import { createHandler, CRON_STALE_MS, MANUAL_STALE_MS, type HandlerDeps } from './handler.ts'
import { syncCalendars } from './sync.ts'

const NOW = new Date('2026-11-10T12:00:00Z')
const rdv: CalendarOccurrence = { uid: 'a', title: 'Dentiste', location: null, description: null, allDay: false, startsAt: '2026-11-10T08:00:00Z', endsAt: '2026-11-10T09:00:00Z' }
const urlOf = (id: string) => `https://calendar.google.com/calendar/ical/${id}/private-x/basic.ics`

function setup(fetchOccurrences: CalendarProvider<IcalCredentials>['fetchOccurrences'] = async () => [rdv]) {
  const deps = {
    secret: 'secret-cron',
    isSignedIn: vi.fn(async (authorization: string | null) => authorization === 'Bearer jeton'),
    now: () => NOW,
    providers: { ical: { kind: 'ical' as const, fetchOccurrences: vi.fn(fetchOccurrences) } },
    loadSources: vi.fn(async (_staleBefore: Date) => [
      { id: 's1', provider: 'ical' as const },
      { id: 's2', provider: 'ical' as const },
    ]),
    loadCredentials: vi.fn(async (id: string): Promise<IcalCredentials | null> => ({ provider: 'ical', url: urlOf(id) })),
    saveOccurrences: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
    log: vi.fn(),
  } satisfies HandlerDeps
  return deps
}

describe('synchronisation', () => {
  it('remplace les occurrences de chaque source', async () => {
    const deps = setup()
    expect(await syncCalendars(deps, NOW)).toEqual({ synced: 2, failed: 0 })
    expect(deps.providers.ical.fetchOccurrences).toHaveBeenCalledWith({ provider: 'ical', url: urlOf('s1') }, { from: new Date('2026-11-03T12:00:00Z'), to: new Date('2027-01-09T12:00:00Z') })
    expect(deps.saveOccurrences).toHaveBeenCalledWith('s1', [rdv])
    expect(deps.saveOccurrences).toHaveBeenCalledWith('s2', [rdv])
    expect(deps.recordFailure).not.toHaveBeenCalled()
  })

  it('une source en erreur n’empêche pas les autres ; son message est noté', async () => {
    const deps = setup(async ({ url }) => {
      if (url === urlOf('s1')) throw new CalendarSyncError('Agenda introuvable.')
      return [rdv]
    })
    expect(await syncCalendars(deps, NOW)).toEqual({ synced: 1, failed: 1 })
    expect(deps.recordFailure).toHaveBeenCalledWith('s1', 'Agenda introuvable.')
    expect(deps.saveOccurrences).toHaveBeenCalledTimes(1)
    expect(deps.saveOccurrences).toHaveBeenCalledWith('s2', [rdv])
  })

  it('erreur inattendue : message générique (le détail va au journal)', async () => {
    const deps = setup(async () => {
      throw new Error('stack technique')
    })
    deps.recordFailure.mockRejectedValueOnce(new Error('base indisponible'))
    expect(await syncCalendars(deps, NOW)).toEqual({ synced: 0, failed: 2 })
    expect(deps.recordFailure).toHaveBeenCalledWith('s2', 'Synchronisation impossible pour le moment.')
    expect(deps.log).toHaveBeenCalledWith('échec non enregistré', expect.objectContaining({ source: 's1' }))
  })

  it('accès manquant : la source est en erreur', async () => {
    const deps = setup()
    deps.loadCredentials.mockResolvedValueOnce(null)
    expect(await syncCalendars(deps, NOW)).toEqual({ synced: 1, failed: 1 })
    expect(deps.recordFailure).toHaveBeenCalledWith('s1', expect.stringContaining('Accès à l’agenda manquant'))
  })
})

describe('handler', () => {
  const post = (headers: Record<string, string> = {}) => new Request('https://fn.test/sync-calendars', { method: 'POST', headers, body: '{}' })

  it('tâche planifiée : sources non synchronisées depuis 10 minutes', async () => {
    const deps = setup()
    const response = await createHandler(deps)(post({ 'x-cron-secret': 'secret-cron' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ synced: 2, failed: 0 })
    expect(deps.loadSources).toHaveBeenCalledWith(new Date(NOW.getTime() - CRON_STALE_MS))
    expect(deps.log).toHaveBeenCalledWith('agendas synchronisés', { by: 'cron', synced: 2, failed: 0 })
  })

  it('bouton « Synchroniser » : personne connectée, sources non synchronisées depuis 1 minute', async () => {
    const deps = setup()
    expect((await createHandler(deps)(post({ authorization: 'Bearer jeton' }))).status).toBe(200)
    expect(deps.loadSources).toHaveBeenCalledWith(new Date(NOW.getTime() - MANUAL_STALE_MS))
  })

  it('refuse les autres appels', async () => {
    const deps = setup()
    const handle = createHandler(deps)
    expect((await handle(post({ 'x-cron-secret': 'faux' }))).status).toBe(401)
    expect((await handle(post({ authorization: 'Bearer inconnu' }))).status).toBe(401)
    expect((await handle(new Request('https://fn.test/sync-calendars'))).status).toBe(405)
    expect((await handle(new Request('https://fn.test/sync-calendars', { method: 'OPTIONS' }))).status).toBe(200)
    expect((await createHandler({ ...deps, secret: undefined })(post({ 'x-cron-secret': '' }))).status).toBe(401)
    expect(deps.loadSources).not.toHaveBeenCalled()
  })

  it('erreur de la base : 500 et journal', async () => {
    const deps = setup()
    deps.loadSources.mockRejectedValueOnce(new Error('base indisponible'))
    const response = await createHandler(deps)(post({ 'x-cron-secret': 'secret-cron' }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Synchronisation des agendas impossible.' })
    expect(deps.log).toHaveBeenCalledWith('synchronisation des agendas en erreur', { error: 'Error: base indisponible' })
  })
})

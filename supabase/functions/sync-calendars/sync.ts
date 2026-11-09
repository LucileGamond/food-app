// Synchronisation des agendas : pour chaque source, ses occurrences sur la période (remplacées d'un bloc), ou
// l'erreur à afficher sur la source. Indépendante de Deno et de la base (dépendances injectées).

import type { CalendarOccurrence } from '../_shared/agenda/occurrence.ts'
import { CalendarSyncError, syncWindow, type CalendarCredentials, type CalendarProviderKind, type CalendarProviders } from '../_shared/agenda/provider.ts'

export interface SourceToSync {
  id: string
  provider: CalendarProviderKind
}

export interface SyncDeps {
  now: () => Date
  providers: CalendarProviders
  /** Sources sans tentative depuis `staleBefore`, la plus anciennement tentée d'abord. */
  loadSources: (staleBefore: Date) => Promise<SourceToSync[]>
  /** Note le début de la tentative (avant le téléchargement, qui peut ne jamais finir). */
  markStarted: (sourceId: string) => Promise<void>
  loadCredentials: (sourceId: string) => Promise<CalendarCredentials | null>
  /** Remplace les occurrences de la source et note la synchronisation réussie. */
  saveOccurrences: (sourceId: string, occurrences: CalendarOccurrence[]) => Promise<void>
  /** Note l'échec (les occurrences déjà connues restent affichées). */
  recordFailure: (sourceId: string, message: string) => Promise<void>
  log?: (message: string, data?: Record<string, unknown>) => void
}

export interface SyncReport {
  synced: number
  failed: number
}

const FAILURE = 'Synchronisation impossible pour le moment.'

export async function syncCalendars(deps: SyncDeps, staleBefore: Date): Promise<SyncReport> {
  const report: SyncReport = { synced: 0, failed: 0 }
  const window = syncWindow(deps.now())
  // Une source à la fois : une erreur sur l'une n'empêche pas les autres.
  for (const source of await deps.loadSources(staleBefore)) {
    try {
      await deps.markStarted(source.id)
      const occurrences = await fetchSource(deps, source, window)
      await deps.saveOccurrences(source.id, occurrences)
      report.synced += 1
    } catch (error) {
      report.failed += 1
      const message = error instanceof CalendarSyncError ? error.message : FAILURE
      deps.log?.('agenda non synchronisé', { source: source.id, error: String(error) })
      await deps.recordFailure(source.id, message).catch((e: unknown) => deps.log?.('échec non enregistré', { source: source.id, error: String(e) }))
    }
  }
  return report
}

async function fetchSource(deps: SyncDeps, source: SourceToSync, window: ReturnType<typeof syncWindow>): Promise<CalendarOccurrence[]> {
  const credentials = await deps.loadCredentials(source.id)
  if (!credentials || credentials.provider !== source.provider) throw new CalendarSyncError('Accès à l’agenda manquant : supprime la source et ajoute-la de nouveau.')
  // Un seul fournisseur aujourd'hui (iCal) ; le type des accès garantit qu'ils vont avec leur fournisseur.
  return deps.providers[credentials.provider].fetchOccurrences(credentials, window)
}

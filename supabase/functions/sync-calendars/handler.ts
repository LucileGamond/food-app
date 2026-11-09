// Point d'entrée HTTP de sync-calendars, indépendant de Deno pour pouvoir être testé. Deux appelants :
//   - pg_cron, toutes les 15 minutes (en-tête x-cron-secret) : les sources sans tentative depuis 10 minutes (la plus anciennement
//     tentée d'abord) ;
//   - l'application, bouton « Synchroniser » (personne connectée) : celles sans tentative depuis 1 minute.

import { CORS_HEADERS, json } from '../_shared/anthropic.ts'
import { sameSecret } from '../_shared/secret.ts'
import { syncCalendars, type SyncDeps } from './sync.ts'

export const CRON_STALE_MS = 10 * 60_000
export const MANUAL_STALE_MS = 60_000

export interface HandlerDeps extends SyncDeps {
  secret: string | undefined
  /** Le jeton appartient à une personne connectée (voir _shared/auth.ts). */
  isSignedIn: (authorization: string | null) => Promise<string | boolean | null>
}

async function caller(deps: HandlerDeps, request: Request): Promise<'cron' | 'user' | null> {
  if (deps.secret && sameSecret(request.headers.get('x-cron-secret'), deps.secret)) return 'cron'
  return (await deps.isSignedIn(request.headers.get('authorization'))) ? 'user' : null
}

export function createHandler(deps: HandlerDeps) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)
    const by = await caller(deps, request)
    if (!by) return json({ error: 'Connexion requise.' }, 401)
    try {
      const staleBefore = new Date(deps.now().getTime() - (by === 'cron' ? CRON_STALE_MS : MANUAL_STALE_MS))
      const report = await syncCalendars(deps, staleBefore)
      if (report.synced + report.failed > 0) deps.log?.('agendas synchronisés', { by, ...report })
      return json(report)
    } catch (error) {
      deps.log?.('synchronisation des agendas en erreur', { error: String(error) })
      return json({ error: 'Synchronisation des agendas impossible.' }, 500)
    }
  }
}

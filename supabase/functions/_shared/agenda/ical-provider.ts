// Fournisseur « adresse iCal » : télécharge l'agenda Google à son adresse secrète et le lit.

import { isGoogleHost, normalizeIcalUrl } from './ical-url.ts'
import { parseIcs } from './ics.ts'
import { CalendarSyncError, type CalendarProvider, type IcalCredentials } from './provider.ts'

/** Taille maximale d'un agenda téléchargé (un agenda Google de plusieurs années fait quelques Mo). */
export const MAX_ICS_CHARS = 15_000_000
const TIMEOUT_MS = 20_000

const UNREACHABLE = 'Agenda injoignable pour le moment : nouvel essai à la prochaine synchronisation.'

export function createIcalProvider(doFetch: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): CalendarProvider<IcalCredentials> {
  return {
    kind: 'ical',
    async fetchOccurrences({ url }, window) {
      if (!normalizeIcalUrl(url)) throw new CalendarSyncError('Adresse d’agenda non autorisée.')
      const response = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => {
        throw new CalendarSyncError(UNREACHABLE)
      })
      if (response.status === 404) throw new CalendarSyncError('Agenda introuvable : l’adresse a peut-être été réinitialisée dans Google.')
      if (response.status === 401 || response.status === 403) throw new CalendarSyncError('Google refuse l’accès : vérifie l’adresse secrète.')
      if (!response.ok) throw new CalendarSyncError(UNREACHABLE)
      if (response.url && !isGoogleHost(response.url)) throw new CalendarSyncError('Adresse d’agenda non autorisée.')
      const text = await response.text()
      if (text.length > MAX_ICS_CHARS) throw new CalendarSyncError('Agenda trop volumineux.')
      return parseIcs(text, window)
    },
  }
}

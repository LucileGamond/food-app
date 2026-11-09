import { AGENDA_TIME_ZONE } from '@agenda/occurrence.ts'
import type { AgendaScope } from '@agenda/scope.ts'
import { toCivilDate } from '@watering/civil-date.ts'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { useAuth } from '@/auth/AuthProvider'
import { useAsync } from '@/hooks/useAsync'
import { useRealtimeReload } from '@/hooks/useRealtimeReload'
import { useToday } from '@/hooks/useToday'
import type { IsoDate } from '@/lib/dates'

const agendaToday = () => toCivilDate(new Date(), AGENDA_TIME_ZONE)

/** Jour du foyer (Paris), tenu à jour. `fixed` : tests. */
export function useAgendaToday(fixed?: IsoDate): IsoDate {
  return useToday(fixed, agendaToday)
}

/** Agendas affichés (réglage de la personne) et le prénom de l'autre, pour les libellés. */
export function useAgendaScope() {
  const { settings, update, ready } = useSettings()
  const { userId, profiles } = useAuth()
  const setScope = useCallback((scope: AgendaScope) => void update({ agendaScope: scope }), [update])
  return {
    scope: settings.agendaScope,
    setScope,
    /** Réglages chargés : le choix peut être modifié. */
    ready,
    viewerId: userId ?? '',
    otherName: profiles.find((p) => p.id !== userId)?.display_name ?? 'L’autre',
  }
}

/**
 * Événements des jours [from, to] et sources ; rechargés à chaque synchronisation. Au changement de période, les
 * événements sont null (chargement) tant que ceux de la nouvelle période ne sont pas arrivés : les nouveaux jours
 * n'affichent pas « Aucun rendez-vous » avec les données de l'ancienne.
 */
export function useAgendaEvents(from: IsoDate, to: IsoDate) {
  const api = useApi()
  const { data, error, reload } = useAsync(async () => {
    const [events, sources] = await Promise.all([api.agenda.listEvents(from, to), api.agenda.listSources()])
    return { from, to, events, sources }
  }, [api, from, to])
  useRealtimeReload(api.agenda.subscribe, reload)
  const current = data?.from === from && data.to === to
  return { events: current ? data.events : null, sources: data?.sources ?? null, error, reload }
}

/** Sources du foyer et leurs gestes (ajout, suppression, synchronisation). */
export function useCalendarSources() {
  const api = useApi()
  const { data: sources, error, reload } = useAsync(() => api.agenda.listSources(), [api])
  useRealtimeReload(api.agenda.subscribe, reload)
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (action: () => Promise<void>, success?: string): Promise<boolean> => {
      setBusy(true)
      try {
        await action()
        if (success) toast.success(success)
        reload()
        return true
      } catch (e) {
        toast.error(errorMessage(e))
        return false
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  const sync = useCallback(() => run(() => api.agenda.syncNow()), [api, run])
  const add = useCallback(
    (name: string, url: string) =>
      run(async () => {
        await api.agenda.addIcalSource(name, url)
        // Premiers événements tout de suite ; sinon, la synchronisation planifiée s'en chargera.
        await api.agenda.syncNow().catch(() => undefined)
      }, `Agenda « ${name} » ajouté`),
    [api, run],
  )
  const remove = useCallback((id: string, name: string) => run(() => api.agenda.deleteSource(id), `Agenda « ${name} » supprimé`), [api, run])

  return { sources: sources ?? null, error, reload, busy, add, remove, sync }
}

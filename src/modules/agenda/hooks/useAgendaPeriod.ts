import { isCivilDate } from '@watering/civil-date.ts'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { IsoDate } from '@/lib/dates'
import { periodOf, shift, type AgendaView } from '../lib/calendar'

/**
 * Vue (semaine ou mois) et jour choisi, gardés dans l'adresse (?vue=mois&jour=2026-11-10) : au retour sur la page,
 * on retrouve ce qu'on regardait. Sans jour choisi : aujourd'hui.
 */
export function useAgendaPeriod(today: IsoDate) {
  const [params, setParams] = useSearchParams()
  const view: AgendaView = params.get('vue') === 'mois' ? 'mois' : 'semaine'
  const asked = params.get('jour')
  const selected = asked && isCivilDate(asked) ? asked : today
  const period = useMemo(() => periodOf(view, selected), [view, selected])

  const go = useCallback(
    (next: { view?: AgendaView; day?: IsoDate }) =>
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          const nextView = next.view ?? view
          const nextDay = next.day ?? selected
          if (nextView === 'mois') copy.set('vue', 'mois')
          else copy.delete('vue')
          if (nextDay === today) copy.delete('jour')
          else copy.set('jour', nextDay)
          return copy
        },
        { replace: true },
      ),
    [setParams, view, selected, today],
  )

  return {
    view,
    selected,
    period,
    setView: (next: AgendaView) => go({ view: next }),
    select: (day: IsoDate) => go({ day }),
    move: (step: number) => go({ day: shift(view, selected, step) }),
    goToday: () => go({ day: today }),
  }
}

import { occurrencesOn } from '@agenda/occurrence.ts'
import { formatDay, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { AgendaEvent } from '../lib/agenda'
import { formatMonth, sameMonth, WEEKDAY_SHORT } from '../lib/calendar'

const MAX_DOTS = 3
const MAX_TITLES = 2

function countLabel(count: number): string {
  return count === 0 ? 'aucun rendez-vous' : count === 1 ? '1 rendez-vous' : `${count} rendez-vous`
}

/**
 * Mois en grille (lundi → dimanche) : un point par rendez-vous sur téléphone, les premiers titres sur ordinateur.
 * Toucher un jour le choisit (ses rendez-vous s'affichent sous la grille).
 */
export function MonthGrid({ days, selected, today, events, viewerId, onSelect }: { days: IsoDate[]; selected: IsoDate; today: IsoDate; events: AgendaEvent[]; viewerId: string; onSelect: (day: IsoDate) => void }) {
  return (
    <div role="group" aria-label={formatMonth(selected)} className="rounded-2xl border bg-background p-2 shadow-xs sm:p-3">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium text-muted-foreground" aria-hidden>
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const ofDay = occurrencesOn(events, day)
          const inMonth = sameMonth(day, selected)
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={day === selected}
              aria-current={day === today ? 'date' : undefined}
              aria-label={`${formatDay(day)} : ${countLabel(ofDay.length)}`}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-center gap-1 rounded-lg p-1 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-24 md:items-stretch',
                !inMonth && 'text-muted-foreground/60',
                day === selected && 'bg-brand/10 ring-1 ring-brand/40',
              )}
            >
              <span className={cn('flex size-7 items-center justify-center rounded-full tabular-nums md:self-start', day === today && 'bg-brand font-semibold text-white dark:text-background')}>
                {Number(day.slice(8))}
              </span>
              {/* Téléphone : des points */}
              <span className="flex gap-0.5 md:hidden" aria-hidden>
                {ofDay.slice(0, MAX_DOTS).map((e) => (
                  <span key={e.id} className={cn('size-1.5 rounded-full', e.ownerId === viewerId ? 'bg-brand' : 'bg-muted-foreground')} />
                ))}
              </span>
              {/* Ordinateur : les premiers titres */}
              <span className="hidden min-w-0 flex-col gap-0.5 md:flex" aria-hidden>
                {ofDay.slice(0, MAX_TITLES).map((e) => (
                  <span key={e.id} className={cn('truncate rounded px-1 text-left text-xs', e.ownerId === viewerId ? 'bg-brand/10 text-foreground' : 'bg-muted text-muted-foreground')}>
                    {e.title}
                  </span>
                ))}
                {ofDay.length > MAX_TITLES && <span className="px-1 text-left text-xs text-muted-foreground">+{ofDay.length - MAX_TITLES}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

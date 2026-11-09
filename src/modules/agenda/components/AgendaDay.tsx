import { Droplets, UtensilsCrossed } from 'lucide-react'
import { formatDay, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { isSyncedDay, type AgendaEvent } from '../lib/agenda'
import type { DayExtra } from '../lib/extras'
import { EventItem } from './EventItem'

const EXTRA_ICONS = { meal: UtensilsCrossed, watering: Droplets } as const

/** Un jour de la semaine : ses rendez-vous, puis les repas et arrosages prévus. */
export function AgendaDay({ day, today, events, extras, viewerId, showOwner }: { day: IsoDate; today: IsoDate; events: AgendaEvent[]; extras: DayExtra[]; viewerId: string; showOwner: boolean }) {
  const synced = isSyncedDay(day, today)
  const id = `agenda-${day}`
  return (
    <section aria-labelledby={id} className={cn('rounded-2xl border bg-background p-4 shadow-xs', day === today && 'border-brand/50')}>
      <h2 id={id} className="mb-2 font-semibold tracking-tight">
        {formatDay(day)}
        {day === today && <span className="ml-2 text-sm font-normal text-brand">aujourd’hui</span>}
      </h2>
      {events.length === 0 ? (
        <p className="py-1.5 text-sm text-muted-foreground">{synced ? 'Aucun rendez-vous' : 'Hors de la période synchronisée (la semaine passée et les deux mois à venir)'}</p>
      ) : (
        <ul aria-label={`Rendez-vous — ${formatDay(day)}`} className="divide-y">
          {events.map((event) => (
            <EventItem key={event.id} event={event} day={day} viewerId={viewerId} showOwner={showOwner} />
          ))}
        </ul>
      )}
      {extras.length > 0 && (
        <ul aria-label={`Repas et arrosages — ${formatDay(day)}`} className="mt-2 space-y-1 border-t pt-2">
          {extras.map((extra) => {
            const Icon = EXTRA_ICONS[extra.kind]
            return (
              <li key={extra.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className={cn('size-4 shrink-0', extra.kind === 'watering' && 'text-water')} aria-hidden />
                <span className="w-16 shrink-0">{extra.label}</span>
                <span className="min-w-0 truncate text-foreground">{extra.text}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

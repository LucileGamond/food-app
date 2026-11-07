import { formatOccurrenceTime } from '@agenda/format.ts'
import { MapPin } from 'lucide-react'
import type { IsoDate } from '@/lib/dates'
import type { AgendaEvent } from '../lib/agenda'

/** Un rendez-vous vu depuis un jour : horaire, titre, lieu ; le prénom quand ce n'est pas mon agenda. */
export function EventItem({ event, day, viewerId, showOwner }: { event: AgendaEvent; day: IsoDate; viewerId: string; showOwner: boolean }) {
  const time = formatOccurrenceTime(event, day)
  return (
    <li className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground tabular-nums">{time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{event.title}</span>
        {event.location && (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </span>
      {showOwner && event.ownerId !== viewerId && <span className="h-fit shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{event.ownerName}</span>}
    </li>
  )
}

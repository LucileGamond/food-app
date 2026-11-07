import { formatOccurrenceTime } from '@agenda/format.ts'
import { MapPin } from 'lucide-react'
import { useState } from 'react'
import type { IsoDate } from '@/lib/dates'
import type { AgendaEvent } from '../lib/agenda'
import { EventDetails } from './EventDetails'

/**
 * Un rendez-vous vu depuis un jour : horaire, titre, lieu ; le prénom quand ce n'est pas mon agenda. Un clic ouvre
 * son détail.
 */
export function EventItem({ event, day, viewerId, showOwner }: { event: AgendaEvent; day: IsoDate; viewerId: string; showOwner: boolean }) {
  const [open, setOpen] = useState(false)
  const time = formatOccurrenceTime(event, day)
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] gap-3 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
          {time}
          <span className="sr-only"> : </span>
        </span>
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
        <span className="sr-only"> — voir le détail</span>
      </button>
      <EventDetails event={event} viewerId={viewerId} open={open} onOpenChange={setOpen} />
    </li>
  )
}

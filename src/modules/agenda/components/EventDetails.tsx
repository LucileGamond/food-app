import { formatOccurrenceWhen } from '@agenda/format.ts'
import { CalendarDays, Clock, ExternalLink, MapPin } from 'lucide-react'
import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LinkifiedText } from '@/components/LinkifiedText'
import { mapsUrl, type AgendaEvent } from '../lib/agenda'

function Row({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className="sr-only">{label} : </span>
        {children}
      </div>
    </div>
  )
}

/** Détail d'un rendez-vous : quand, où, dans quel agenda, et sa description. Lecture seule. */
export function EventDetails({ event, viewerId, open, onOpenChange }: { event: AgendaEvent; viewerId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 text-lg leading-snug break-words">{event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Row icon={Clock} label="Quand">
            {formatOccurrenceWhen(event)}
          </Row>
          {event.location && (
            <Row icon={MapPin} label="Lieu">
              <span className="break-words">{event.location}</span>
              <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer noopener" className="mt-0.5 flex w-fit items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
                Ouvrir dans Maps <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Row>
          )}
          <Row icon={CalendarDays} label="Agenda">
            {event.sourceName} · {event.ownerId === viewerId ? 'moi' : event.ownerName}
          </Row>
          {event.description && (
            <div className="border-t pt-3">
              <LinkifiedText text={event.description} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

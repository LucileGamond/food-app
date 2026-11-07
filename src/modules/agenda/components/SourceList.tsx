import { formatTime } from '@agenda/format.ts'
import { AlertCircle, CheckCircle2, Clock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { formatShortDate } from '@/lib/dates'
import { AGENDA_TIME_ZONE } from '@agenda/occurrence.ts'
import { toCivilDate } from '@watering/civil-date.ts'
import { sourceStatus, type CalendarSource } from '../lib/agenda'

/** « à 14 h 05 » aujourd'hui, « le 3 novembre » sinon. */
function formatSyncedAt(instant: string, today: string): string {
  const day = toCivilDate(instant, AGENDA_TIME_ZONE)
  return day === today ? `à ${formatTime(instant)}` : `le ${formatShortDate(day)}`
}

function SourceStatusLine({ source, today }: { source: CalendarSource; today: string }) {
  const status = sourceStatus(source)
  if (status === 'error')
    return (
      <p className="flex items-start gap-1.5 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        {source.lastError}
      </p>
    )
  if (status === 'pending')
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" aria-hidden />
        En attente de synchronisation
      </p>
    )
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-brand" aria-hidden />
      Synchronisé {formatSyncedAt(source.lastSyncedAt!, today)}
    </p>
  )
}

/** Agendas suivis par le foyer ; seul son propriétaire peut ne plus suivre un agenda. */
export function SourceList({ sources, viewerId, today, onRemove }: { sources: CalendarSource[]; viewerId: string; today: string; onRemove: (id: string, name: string) => Promise<boolean> }) {
  const [removing, setRemoving] = useState<CalendarSource | null>(null)
  return (
    <>
      <ul aria-label="Agendas suivis" className="min-w-0 divide-y rounded-2xl border bg-background shadow-xs">
        {sources.map((source) => (
          <li key={source.id} className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex min-w-0 gap-1 font-medium">
                <span className="truncate">{source.name}</span>{' '}
                <span className="shrink-0 font-normal text-muted-foreground">· {source.ownerId === viewerId ? 'moi' : source.ownerName}</span>
              </p>
              <SourceStatusLine source={source} today={today} />
            </div>
            {source.ownerId === viewerId && (
              <Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label={`Ne plus suivre ${source.name}`} onClick={() => setRemoving(source)}>
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Ne plus suivre « ${removing?.name ?? ''} » ?`}
        description="Ses rendez-vous disparaîtront de l’application. Ton agenda Google n’est pas modifié."
        confirmLabel="Ne plus suivre"
        onConfirm={async () => {
          if (removing) await onRemove(removing.id, removing.name)
        }}
      />
    </>
  )
}

import { daysBetween } from '@watering/civil-date.ts'
import { History, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { capitalize } from '@/lib/text'
import { formatLongDate, formatShortDate, formatTime } from '../lib/dates'
import { formatAmount } from '../lib/format'
import { wateredOn, type WateringEvent } from '../lib/plants'
import { useProfileName } from '../hooks/usePlants'

/** Historique : quand, qui, combien, prévu ou hors planning, en retard ou non. */
export function WateringHistory({ events, onUndo }: { events: WateringEvent[]; onUndo: (eventId: string) => Promise<void> }) {
  const nameOf = useProfileName()
  const [toDelete, setToDelete] = useState<WateringEvent | null>(null)

  if (events.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="size-4" aria-hidden /> Aucun arrosage noté pour l’instant.
      </p>
    )
  }

  return (
    <>
      <ol className="divide-y" aria-label="Historique des arrosages">
        {events.map((event) => {
          const day = wateredOn(event)
          const late = event.scheduled_on ? daysBetween(event.scheduled_on, day) : 0
          return (
            <li key={event.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{capitalize(formatLongDate(day))}</span>
                  <span className="text-muted-foreground"> à {formatTime(event.watered_at)}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Par <span className="font-medium text-foreground">{nameOf(event.done_by)}</span>
                  {event.amount_ml !== null && <> · {formatAmount(event.amount_ml)}</>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {event.scheduled_on === null ? (
                    <Badge variant="outline">Hors planning</Badge>
                  ) : late > 0 ? (
                    <Badge variant="outline" className="border-warning/40 text-warning">
                      Prévu le {formatShortDate(event.scheduled_on)} · {late} j de retard
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-brand/40 text-brand">
                      Prévu le {formatShortDate(event.scheduled_on)}
                    </Badge>
                  )}
                </div>
                {event.note && <p className="text-sm text-muted-foreground italic">{event.note}</p>}
              </div>
              <Button variant="ghost" size="icon-lg" aria-label={`Supprimer l’arrosage du ${formatLongDate(day)}`} onClick={() => setToDelete(event)}>
                <Trash2 />
              </Button>
            </li>
          )
        })}
      </ol>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Supprimer cet arrosage ?"
        description="Il disparaîtra de l’historique et l’échéance correspondante sera de nouveau à faire."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (toDelete) await onUndo(toDelete.id)
        }}
      />
    </>
  )
}

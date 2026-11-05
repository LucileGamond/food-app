import { cn } from '@/lib/utils'
import { formatRelativeDay, formatTime } from '../lib/dates'
import { wateredOn, type WateringEvent } from '../lib/plants'
import { useProfileName } from '../hooks/usePlants'

/** « Arrosée hier par Eric », « Arrosée aujourd’hui à 9 h 12 par Lucile », « Jamais arrosée » */
export function LastWatered({ event, today, className }: { event: WateringEvent | null; today: string; className?: string }) {
  const nameOf = useProfileName()
  if (!event) return <p className={cn('text-xs text-muted-foreground', className)}>Jamais arrosée</p>
  const day = wateredOn(event)
  const when = day === today ? `aujourd’hui à ${formatTime(event.watered_at)}` : formatRelativeDay(day, today)
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Arrosée {when} par <span className="font-medium text-foreground">{nameOf(event.done_by)}</span>
    </p>
  )
}

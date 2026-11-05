import { AlertCircle, CalendarClock, Droplets, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeDay } from '../lib/dates'
import { formatAmount } from '../lib/format'
import type { PlantStatus } from '../lib/status'

/** Ligne d'état : à arroser, en retard, prochain arrosage ou aucune règle. */
export function WateringStatus({ status, today, className }: { status: PlantStatus; today: string; className?: string }) {
  const { pending, overdueDays, next } = status.schedule

  if (pending && overdueDays > 0) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm font-medium text-warning', className)}>
        <AlertCircle className="size-4" aria-hidden />
        En retard de {overdueDays} jour{overdueDays > 1 ? 's' : ''} · {formatAmount(pending.amountMl)}
      </p>
    )
  }
  if (pending) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm font-medium text-water', className)}>
        <Droplets className="size-4" aria-hidden />
        À arroser aujourd’hui · {formatAmount(pending.amountMl)}
      </p>
    )
  }
  if (next) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
        <CalendarClock className="size-4" aria-hidden />
        Prochain arrosage {formatRelativeDay(next.date, today)} · {formatAmount(next.amountMl)}
      </p>
    )
  }
  return (
    <p className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <MinusCircle className="size-4" aria-hidden />
      {status.plant.rules.length === 0 ? 'Aucune règle d’arrosage' : 'Pas d’arrosage prévu'}
    </p>
  )
}

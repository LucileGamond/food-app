import { Minus, Plus } from 'lucide-react'
import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { formatShortDate, type IsoDate } from '@/lib/dates'
import { consumptionsOn, formatPortion, itemUsage, mealLabel, type PeriodItem } from '@/lib/food'
import { cn } from '@/lib/utils'

interface Props {
  item: PeriodItem
  date: IsoDate
  onAdd: (itemId: string, date: IsoDate) => void
  onRemove: (itemId: string, date: IsoDate) => void
}

/** Un aliment du plan : pastilles du quota sur la période, et +/− pour le jour choisi. */
export const FoodItemRow = memo(function FoodItemRow({ item, date, onAdd, onRemove }: Props) {
  const usage = itemUsage(item)
  const today = consumptionsOn(item, date).length
  const portion = formatPortion(item.quantity, item.unit)
  const label = `« ${item.name} » (${mealLabel(item.meal)})`
  const full = usage.remaining === 0

  return (
    <li className="flex items-center gap-3 py-2.5" data-testid={`food-item-${item.id}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-medium">{item.name}</span>
          {portion && <span className="whitespace-nowrap text-muted-foreground"> · {portion}</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Pastilles du quota : le numéro du jour s'affiche dans chaque consommation (lisible au doigt comme à la souris). */}
          <span className="flex flex-wrap gap-1" aria-hidden>
            {usage.dots.map((dot, i) => (
              <span
                key={i}
                title={dot.date ? formatShortDate(dot.date) : undefined}
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[0.625rem] leading-none font-semibold tabular-nums',
                  dot.kind === 'free' && 'border border-foreground/25',
                  dot.kind === 'used' && 'bg-brand text-white',
                  dot.kind === 'over' && 'bg-destructive text-white',
                  dot.date === date && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-background',
                )}
              >
                {dot.date && Number(dot.date.slice(8))}
              </span>
            ))}
          </span>
          {usage.used > 0 && (
            <span className="sr-only">
              Noté le{usage.used > 1 ? 's' : ''} {usage.dots.flatMap((d) => (d.date ? [formatShortDate(d.date)] : [])).join(', ')}.
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.min(usage.used, usage.allowed)}/{usage.allowed}
          </span>
          {usage.over > 0 && <span className="text-xs font-medium text-destructive">+{usage.over} hors plan</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={`Retirer ${label}`}
          disabled={today === 0}
          onClick={() => onRemove(item.id, date)}
        >
          <Minus />
        </Button>
        <span className={cn('w-6 text-center text-sm font-semibold tabular-nums', today === 0 && 'text-muted-foreground')}>
          {today}
          <span className="sr-only"> le {formatShortDate(date)}</span>
        </span>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={`Ajouter ${label}${full ? ' (hors plan)' : ''}`}
          title={full ? 'Quota atteint : la consommation sera hors plan' : undefined}
          onClick={() => onAdd(item.id, date)}
          className={cn(full && 'border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive')}
        >
          <Plus />
        </Button>
      </div>
    </li>
  )
})

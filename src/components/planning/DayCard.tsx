import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDay, type IsoDate } from '@/lib/dates'
import { DROP_PREFIX, SLOTS, mealCountLabel, slotKey, slotLabel, type Meal, type MealSlot, type Profile } from '@/lib/meals'
import { cn } from '@/lib/utils'
import { MealItem, type MealAction } from './MealItem'

interface SlotProps {
  date: IsoDate
  slot: MealSlot
  meals: Meal[]
  profiles: Profile[]
  disabled?: boolean
  onAdd: (date: IsoDate, slot: MealSlot) => void
  onAction: (action: MealAction, meal: Meal) => void
}

function SlotSection({ date, slot, meals, profiles, disabled, onAdd, onAction }: SlotProps) {
  const key = slotKey({ date, slot })
  const { setNodeRef, isOver, active } = useDroppable({ id: `${DROP_PREFIX}${key}` })
  const label = slotLabel(slot)

  return (
    <section
      ref={setNodeRef}
      aria-label={`${formatDay(date)} — ${label}`}
      data-slot-key={key}
      className={cn(
        'rounded-xl p-2 transition-colors',
        active && 'ring-1 ring-border ring-dashed',
        isOver && 'bg-brand/10 ring-2 ring-brand/60 ring-solid',
      )}
    >
      <div className="mb-1 flex items-center justify-between pl-1">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => onAdd(date, slot)}
          disabled={disabled}
          aria-label={`Ajouter un repas — ${formatDay(date)}, ${label}`}
        >
          <Plus />
        </Button>
      </div>
      {meals.length === 0 ? (
        <p className="px-1 pb-2 text-sm text-muted-foreground">Aucun repas prévu</p>
      ) : (
        <ul className="space-y-2">
          {meals.map((meal) => (
            <MealItem key={meal.id} meal={meal} profiles={profiles} disabled={disabled} onAction={onAction} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface DayProps {
  date: IsoDate
  isToday: boolean
  mealsBySlot: Map<string, Meal[]>
  profiles: Profile[]
  disabled?: boolean
  onAdd: (date: IsoDate, slot: MealSlot) => void
  onAction: (action: MealAction, meal: Meal) => void
}

export function DayCard({ date, isToday, mealsBySlot, profiles, disabled, onAdd, onAction }: DayProps) {
  const count = SLOTS.reduce((n, slot) => n + (mealsBySlot.get(slotKey({ date, slot }))?.length ?? 0), 0)

  return (
    <article
      aria-label={formatDay(date)}
      data-testid="day-card"
      className={cn('rounded-2xl border bg-background p-3 shadow-xs', isToday && 'border-brand/40')}
    >
      <header className="mb-1 flex items-center justify-between gap-2 px-1 pt-1">
        <h2 className="flex items-center gap-2 font-semibold tracking-tight">
          {formatDay(date)}
          {isToday && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">Aujourd'hui</span>}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{mealCountLabel(count)}</span>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-2">
        {SLOTS.map((slot) => (
          <SlotSection
            key={slot}
            date={date}
            slot={slot}
            meals={mealsBySlot.get(slotKey({ date, slot })) ?? []}
            profiles={profiles}
            disabled={disabled}
            onAdd={onAdd}
            onAction={onAction}
          />
        ))}
      </div>
    </article>
  )
}

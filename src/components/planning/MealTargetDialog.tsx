import { useState, type FormEvent } from 'react'
import { useOnOpen } from '@/hooks/useOnOpen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { formatDay, type IsoDate } from '@/lib/dates'
import { SLOTS, isMoveNeeded, slotLabel, type Meal, type MealSlot, type SlotRef } from '@/lib/meals'

interface Props {
  mode: 'move' | 'duplicate'
  meal: Meal | null
  days: IsoDate[]
  onOpenChange: (open: boolean) => void
  onSubmit: (meal: Meal, target: SlotRef) => Promise<void>
}

/** Choix d'un jour et d'un créneau pour déplacer ou dupliquer un repas. */
export function MealTargetDialog({ mode, meal, days, onOpenChange, onSubmit }: Props) {
  const [date, setDate] = useState<IsoDate>('')
  const [slot, setSlot] = useState<MealSlot>('LUNCH')

  useOnOpen(meal !== null, () => {
    if (!meal) return
    // Par défaut : le premier autre jour visible (duplication) ou le jour du repas (déplacement).
    setDate(mode === 'duplicate' ? (days.find((d) => d !== meal.meal_date) ?? meal.meal_date) : meal.meal_date)
    setSlot(meal.slot)
  })

  const options = meal && !days.includes(meal.meal_date) ? [meal.meal_date, ...days] : days
  const unchanged = mode === 'move' && meal !== null && !isMoveNeeded(meal, { date, slot })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!meal || unchanged) return
    // Le déplacement est optimiste et les erreurs s'affichent en toast : on ferme tout de suite.
    void onSubmit(meal, { date, slot })
    onOpenChange(false)
  }

  const title = mode === 'move' ? 'Déplacer le repas' : 'Dupliquer le repas'

  return (
    <Dialog open={meal !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{meal?.recipe.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="target-day">Jour</Label>
            <NativeSelect id="target-day" className="w-full" value={date} onChange={(e) => setDate(e.target.value)}>
              {options.map((d) => (
                <option key={d} value={d}>
                  {formatDay(d)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-slot">Créneau</Label>
            <NativeSelect id="target-slot" className="w-full" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(s)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={unchanged}>
              {mode === 'move' ? 'Déplacer' : 'Dupliquer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnOpen } from '@/hooks/useOnOpen'
import type { IsoDate } from '@/lib/dates'
import { periodLength, suggestPeriod, validatePeriodForm, type FoodPeriod, type PeriodFormValues } from '@/lib/food'
import { hasErrors } from '@/lib/recipes'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  periods: FoodPeriod[]
  today: IsoDate
  onSubmit: (start: IsoDate, end: IsoDate) => Promise<boolean>
}

export function PeriodDialog({ open, onOpenChange, periods, today, onSubmit }: Props) {
  const [values, setValues] = useState<PeriodFormValues>(() => suggestPeriod(periods, today))
  const [saving, setSaving] = useState(false)

  useOnOpen(open, () => setValues(suggestPeriod(periods, today)))

  const errors = validatePeriodForm(values, periods)
  const days = hasErrors(errors) ? null : periodLength({ start_date: values.start, end_date: values.end })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors(errors)) return
    setSaving(true)
    const ok = await onSubmit(values.start, values.end)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Nouvelle période</DialogTitle>
            <DialogDescription>Les quotas du plan actuel sont repris pour toute la période.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {(['start', 'end'] as const).map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`period-${key}`}>{key === 'start' ? 'Début' : 'Fin (incluse)'}</Label>
                <Input
                  id={`period-${key}`}
                  type="date"
                  value={values[key]}
                  min={key === 'end' ? values.start : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  aria-invalid={Boolean(errors[key]) || undefined}
                  className="h-10"
                />
              </div>
            ))}
          </div>
          {(errors.start || errors.end) && <p className="-mt-2 text-sm text-destructive">{errors.start ?? errors.end}</p>}
          {days !== null && <p className="-mt-2 text-sm text-muted-foreground">{days} jour{days > 1 ? 's' : ''}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || hasErrors(errors)}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Créer la période
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Info, Loader2, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useOnOpen } from '@/hooks/useOnOpen'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDay, type IsoDate } from '@/lib/dates'
import type { Profile } from '@/lib/meals'
import { hasErrors } from '@/lib/recipes'
import {
  formatWeightInput,
  toWeighInValues,
  validateWeighIn,
  type WeighInFormValues,
  type WeighInRow,
  type WeighInValue,
} from '@/lib/weights'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Relevé modifié, ou null pour une nouvelle pesée. */
  editing: WeighInRow | null
  rows: WeighInRow[]
  profiles: Profile[]
  today: IsoDate
  onSubmit: (date: IsoDate, values: WeighInValue[], previousDate?: IsoDate) => Promise<boolean>
  /** Demande de suppression du relevé modifié. */
  onDelete: (row: WeighInRow) => void
}

function valuesFor(row: WeighInRow | undefined, profiles: Profile[]): Record<string, string> {
  return Object.fromEntries(profiles.map((p) => [p.id, formatWeightInput(row?.weights[p.id])]))
}

export function WeighInDialog({ open, onOpenChange, editing, rows, profiles, today, onSubmit, onDelete }: Props) {
  const [values, setValues] = useState<WeighInFormValues>({ date: today, weights: {} })
  const [saving, setSaving] = useState(false)

  useOnOpen(open, () => {
    const date = editing?.date ?? today
    setValues({ date, weights: valuesFor(editing ?? rows.find((r) => r.date === date), profiles) })
  })

  const errors = validateWeighIn(values, today)
  // En création, une pesée existe déjà à cette date : elle sera complétée / mise à jour.
  const existing = !editing || editing.date !== values.date ? rows.find((r) => r.date === values.date) : undefined

  function changeDate(date: IsoDate) {
    const row = rows.find((r) => r.date === date)
    setValues((v) => ({ date, weights: !editing && row ? valuesFor(row, profiles) : v.weights }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors(errors)) return
    setSaving(true)
    const ok = await onSubmit(values.date, toWeighInValues(values), editing && editing.date !== values.date ? editing.date : undefined)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier la pesée' : 'Nouvelle pesée'}</DialogTitle>
            <DialogDescription>Laisse vide le poids d'une personne qui ne s'est pas pesée.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="weigh-date">Date</Label>
            <Input
              id="weigh-date"
              type="date"
              max={today}
              value={values.date}
              onChange={(e) => changeDate(e.target.value)}
              aria-invalid={Boolean(errors.date) || undefined}
              className="h-10"
            />
            {errors.date && <p className="text-sm text-destructive">{errors.date}</p>}
            {existing && (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {editing
                  ? `Une pesée existe déjà le ${formatDay(existing.date).toLowerCase()} : elle sera remplacée.`
                  : 'Une pesée existe déjà à cette date : tu la modifies.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {profiles.map((profile) => {
              const error = errors.weights?.[profile.id]
              return (
                <div key={profile.id} className="space-y-2">
                  <Label htmlFor={`weight-${profile.id}`}>{profile.display_name}</Label>
                  <div className="relative">
                    <Input
                      id={`weight-${profile.id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      value={values.weights[profile.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, weights: { ...v.weights, [profile.id]: e.target.value } }))}
                      aria-invalid={Boolean(error) || undefined}
                      className="h-10 pr-9 text-right tabular-nums"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">kg</span>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
              )
            })}
          </div>

          <DialogFooter>
            {editing && (
              <Button type="button" variant="destructive" className="h-10 sm:mr-auto" onClick={() => onDelete(editing)} disabled={saving}>
                <Trash2 /> Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || hasErrors(errors)}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

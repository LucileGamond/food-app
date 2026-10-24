import { Loader2, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnOpen } from '@/hooks/useOnOpen'
import {
  MEALS,
  emptyPlanItemForm,
  planCategories,
  planItemToForm,
  toPlanItemInput,
  validatePlanItem,
  type FoodMeal,
  type PlanItem,
  type PlanItemFormValues,
  type PlanItemInput,
} from '@/lib/food'
import { hasErrors } from '@/lib/recipes'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Élément modifié, ou null pour un ajout. */
  editing: PlanItem | null
  /** Moment et catégorie proposés pour un ajout. */
  defaults?: { meal: FoodMeal; category: string }
  items: PlanItem[]
  onSubmit: (input: PlanItemInput, id?: string) => Promise<boolean>
  onDelete: (item: PlanItem) => void
}

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

export function PlanItemDialog({ open, onOpenChange, editing, defaults, items, onSubmit, onDelete }: Props) {
  const [values, setValues] = useState<PlanItemFormValues>(emptyPlanItemForm)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useOnOpen(open, () => {
    setValues(editing ? planItemToForm(editing) : emptyPlanItemForm(defaults?.meal, defaults?.category))
    setTouched(false)
  })

  const others = items.filter((i) => i.id !== editing?.id)
  const errors = validatePlanItem(values, others)
  // Les champs requis vides ne sont signalés qu'après une tentative d'enregistrement.
  const shown = touched ? errors : { ...errors, name: values.name.trim() ? errors.name : undefined, category: values.category.trim() ? errors.category : undefined }
  const set = <K extends keyof PlanItemFormValues>(key: K, value: PlanItemFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (hasErrors(errors)) return
    setSaving(true)
    const ok = await onSubmit(toPlanItemInput(values), editing?.id)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  const field = (key: keyof PlanItemFormValues, label: string, input: React.ReactNode) => (
    <div className="space-y-2">
      <Label htmlFor={`plan-${key}`}>{label}</Label>
      {input}
      {shown[key] && <p className="text-sm text-destructive">{shown[key]}</p>}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'aliment" : 'Ajouter un aliment'}</DialogTitle>
            <DialogDescription>Les changements s'appliquent aux prochaines périodes.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {field(
              'meal',
              'Moment',
              <select id="plan-meal" className={selectClass} value={values.meal} onChange={(e) => set('meal', e.target.value as FoodMeal)}>
                {MEALS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>,
            )}
            {field(
              'category',
              'Catégorie',
              <>
                <Input
                  id="plan-category"
                  list="plan-categories"
                  value={values.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="Ex. Produit laitier"
                  aria-invalid={Boolean(shown.category) || undefined}
                  className="h-10"
                />
                <datalist id="plan-categories">
                  {planCategories(items).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>,
            )}
          </div>

          {field(
            'name',
            'Aliment',
            <Input
              id="plan-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex. Yaourt nature"
              aria-invalid={Boolean(shown.name) || undefined}
              className="h-10"
            />,
          )}

          <div className="grid grid-cols-3 gap-3">
            {field(
              'quantity',
              'Quantité',
              <Input
                id="plan-quantity"
                inputMode="decimal"
                autoComplete="off"
                value={values.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="—"
                aria-invalid={Boolean(shown.quantity) || undefined}
                className="h-10 text-right tabular-nums"
              />,
            )}
            {field(
              'unit',
              'Unité',
              <Input
                id="plan-unit"
                value={values.unit}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="g, ml…"
                aria-invalid={Boolean(shown.unit) || undefined}
                className="h-10"
              />,
            )}
            {field(
              'allowed',
              'Fois / période',
              <Input
                id="plan-allowed"
                inputMode="numeric"
                autoComplete="off"
                value={values.allowed}
                onChange={(e) => set('allowed', e.target.value)}
                aria-invalid={Boolean(shown.allowed) || undefined}
                className="h-10 text-right tabular-nums"
              />,
            )}
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
            <Button type="submit" className="h-10" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

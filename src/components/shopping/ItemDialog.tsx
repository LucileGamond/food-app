import { Loader2, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UnitSelect } from '@/components/UnitSelect'
import { useOnOpen } from '@/hooks/useOnOpen'
import { AISLES, emptyItemForm, itemToForm, toItemInput, validateItemForm, type Aisle, type ItemFormValues, type ShoppingItem, type ShoppingItemInput } from '@/lib/shopping'
import { aisleSelectClass } from './QuickAddBar'

interface Props {
  item: ShoppingItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (item: ShoppingItem, input: ShoppingItemInput) => Promise<boolean>
  onDelete: (item: ShoppingItem) => void
}

/** Modification d'un article : nom, quantité, unité, rayon ; suppression. */
export function ItemDialog({ item, onOpenChange, onSubmit, onDelete }: Props) {
  const [values, setValues] = useState<ItemFormValues>(emptyItemForm)
  const [saving, setSaving] = useState(false)

  useOnOpen(item !== null, () => item && setValues(itemToForm(item)))

  const errors = validateItemForm(values)
  const invalid = Object.keys(errors).length > 0
  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!item || invalid) return
    setSaving(true)
    const ok = await onSubmit(item, toItemInput(values))
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={item !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Modifier l'article</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="item-name">Nom</Label>
            <Input id="item-name" value={values.name} maxLength={120} onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name) || undefined} className="h-10" />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="item-quantity">Quantité</Label>
              <Input
                id="item-quantity"
                inputMode="decimal"
                value={values.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                aria-invalid={Boolean(errors.quantity) || undefined}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-unit">Unité</Label>
              <UnitSelect id="item-unit" value={values.unit} onChange={(unit) => set('unit', unit)} />
            </div>
          </div>
          {(errors.quantity || errors.unit) && <p className="-mt-2 text-sm text-destructive">{errors.quantity ?? errors.unit}</p>}
          <div className="space-y-2">
            <Label htmlFor="item-aisle">Rayon</Label>
            <select id="item-aisle" value={values.aisle} onChange={(e) => set('aisle', e.target.value as Aisle)} className={aisleSelectClass}>
              {AISLES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            {item && (
              <Button type="button" variant="destructive" className="h-10 sm:mr-auto" onClick={() => onDelete(item)} disabled={saving}>
                <Trash2 /> Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || invalid}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Plus } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UnitSelect } from '@/components/UnitSelect'
import { AISLES, emptyItemForm, guessAisle, toItemInput, validateItemForm, type Aisle, type ItemFormValues, type ShoppingItemInput } from '@/lib/shopping'
import { cn } from '@/lib/utils'

export const aisleSelectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30'

/** Ajout rapide d'un article : nom (Entrée pour ajouter), quantité, unité et rayon deviné. */
export function QuickAddBar({ onAdd }: { onAdd: (input: ShoppingItemInput) => Promise<boolean> }) {
  const [values, setValues] = useState<ItemFormValues>(emptyItemForm)
  // Rayon choisi à la main : il n'est plus deviné à partir du nom.
  const [aisleTouched, setAisleTouched] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const errors = validateItemForm(values)
  const canAdd = values.name.trim() !== '' && Object.keys(errors).length === 0

  function changeName(name: string) {
    setValues((v) => ({ ...v, name, aisle: aisleTouched ? v.aisle : guessAisle(name) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canAdd) return
    const input = toItemInput(values)
    setValues(emptyItemForm())
    setAisleTouched(false)
    nameInput.current?.focus()
    await onAdd(input)
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Ajouter un article" className="space-y-2">
      <div className="flex gap-2">
        <Input
          ref={nameInput}
          value={values.name}
          onChange={(e) => changeName(e.target.value)}
          placeholder="Ajouter un article"
          aria-label="Nom de l'article"
          maxLength={120}
          className="h-10"
        />
        <Button type="submit" size="icon-lg" className="size-10" aria-label="Ajouter l'article" disabled={!canAdd}>
          <Plus />
        </Button>
      </div>
      <div className="grid grid-cols-[4.5rem_6.5rem_minmax(0,1fr)] gap-2">
        <Input
          value={values.quantity}
          onChange={(e) => setValues((v) => ({ ...v, quantity: e.target.value }))}
          inputMode="decimal"
          placeholder="Qté"
          aria-label="Quantité"
          aria-invalid={Boolean(errors.quantity) || undefined}
          className="h-10 placeholder:text-muted-foreground/40"
        />
        <UnitSelect aria-label="Unité" value={values.unit} onChange={(unit) => setValues((v) => ({ ...v, unit }))} />
        <select
          aria-label="Rayon"
          value={values.aisle}
          onChange={(e) => {
            setAisleTouched(true)
            setValues((v) => ({ ...v, aisle: e.target.value as Aisle }))
          }}
          className={cn(aisleSelectClass)}
        >
          {AISLES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      {errors.quantity && <p className="text-sm text-destructive">{errors.quantity}</p>}
    </form>
  )
}

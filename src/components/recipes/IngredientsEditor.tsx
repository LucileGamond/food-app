import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { moveItem, newIngredientDraft, type IngredientDraft } from '@/lib/recipes'
import { UnitSelect } from '@/components/UnitSelect'

interface Props {
  rows: IngredientDraft[]
  errors?: Record<string, string>
  onChange: (rows: IngredientDraft[]) => void
}

export function IngredientsEditor({ rows, errors = {}, onChange }: Props) {
  function update(key: string, field: 'name' | 'quantity' | 'unit' | 'note', value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function remove(key: string) {
    const next = rows.filter((r) => r.key !== key)
    onChange(next.length > 0 ? next : [newIngredientDraft()])
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_minmax(0,1fr)_7.25rem] gap-2 text-xs [&>span]:pl-1 text-muted-foreground sm:grid" aria-hidden>
        <span>Quantité</span>
        <span>Unité</span>
        <span>Ingrédient</span>
        <span>Précision</span>
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const n = index + 1
          const error = errors[row.key]
          return (
            <li key={row.key} data-testid="ingredient-row">
              <div className="grid grid-cols-[4.5rem_6.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_minmax(0,1fr)_7.25rem]">
                <Input
                  aria-label={`Quantité de l'ingrédient ${n}`}
                  inputMode="decimal"
                  placeholder="200"
                  value={row.quantity}
                  onChange={(e) => update(row.key, 'quantity', e.target.value)}
                  className="h-10 placeholder:text-muted-foreground/40"
                />
                <UnitSelect aria-label={`Unité de l'ingrédient ${n}`} value={row.unit} onChange={(unit) => update(row.key, 'unit', unit)} />
                <Input
                  aria-label={`Nom de l'ingrédient ${n}`}
                  placeholder="Farine"
                  value={row.name}
                  aria-invalid={Boolean(error) || undefined}
                  onChange={(e) => update(row.key, 'name', e.target.value)}
                  // Téléphone : le nom sur toute la largeur, au-dessus de la quantité, de l'unité et de la précision.
                  className="order-first col-span-3 h-10 sm:order-none sm:col-span-1"
                />
                <Input
                  aria-label={`Précision de l'ingrédient ${n}`}
                  placeholder="émincé, bio…"
                  value={row.note}
                  maxLength={200}
                  onChange={(e) => update(row.key, 'note', e.target.value)}
                  className="h-10 placeholder:text-muted-foreground/40"
                />
                <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Monter l'ingrédient ${n}`}
                    disabled={index === 0}
                    onClick={() => onChange(moveItem(rows, index, index - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Descendre l'ingrédient ${n}`}
                    disabled={index === rows.length - 1}
                    onClick={() => onChange(moveItem(rows, index, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label={`Retirer l'ingrédient ${n}`} onClick={() => remove(row.key)}>
                    <X />
                  </Button>
                </div>
              </div>
              {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
            </li>
          )
        })}
      </ol>
      <Button type="button" variant="outline" className="h-10" onClick={() => onChange([...rows, newIngredientDraft()])}>
        <Plus /> Ajouter un ingrédient
      </Button>
    </div>
  )
}

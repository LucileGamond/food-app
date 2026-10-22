import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { moveItem, newIngredientDraft, type IngredientDraft } from '@/lib/recipes'

interface Props {
  rows: IngredientDraft[]
  errors?: Record<string, string>
  onChange: (rows: IngredientDraft[]) => void
}

export function IngredientsEditor({ rows, errors = {}, onChange }: Props) {
  function update(key: string, field: 'name' | 'quantity' | 'unit', value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function remove(key: string) {
    const next = rows.filter((r) => r.key !== key)
    onChange(next.length > 0 ? next : [newIngredientDraft()])
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[5.5rem_5.5rem_1fr_auto] gap-2 px-1 text-xs text-muted-foreground sm:grid" aria-hidden>
        <span>Quantité</span>
        <span>Unité</span>
        <span>Ingrédient</span>
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const n = index + 1
          const error = errors[row.key]
          return (
            <li key={row.key} data-testid="ingredient-row">
              <div className="grid grid-cols-[4.5rem_4.5rem_1fr] gap-2 sm:grid-cols-[5.5rem_5.5rem_1fr_auto]">
                <Input
                  aria-label={`Quantité de l'ingrédient ${n}`}
                  inputMode="decimal"
                  placeholder="200"
                  value={row.quantity}
                  onChange={(e) => update(row.key, 'quantity', e.target.value)}
                  className="h-10"
                />
                <Input
                  aria-label={`Unité de l'ingrédient ${n}`}
                  placeholder="g"
                  value={row.unit}
                  onChange={(e) => update(row.key, 'unit', e.target.value)}
                  className="h-10"
                />
                <Input
                  aria-label={`Nom de l'ingrédient ${n}`}
                  placeholder="Farine"
                  value={row.name}
                  aria-invalid={Boolean(error) || undefined}
                  onChange={(e) => update(row.key, 'name', e.target.value)}
                  className="h-10"
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

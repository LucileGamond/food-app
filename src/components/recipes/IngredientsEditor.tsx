import { ArrowDown, ArrowUp, BookOpen, Heading, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { moveItem, newHeadingDraft, newIngredientDraft, type IngredientDraft } from '@/lib/recipes'
import { CheckNote } from '@/components/recipes/CheckNote'
import { UnitSelect } from '@/components/UnitSelect'
import { cn } from '@/lib/utils'

interface Props {
  rows: IngredientDraft[]
  errors?: Record<string, string>
  /** Points à vérifier après un import, par ligne. */
  flags?: Record<string, string[]>
  onChange: (rows: IngredientDraft[]) => void
}

/**
 * Liste des ingrédients, avec des titres de sous-parties facultatifs (« Pour le streusel ») : les ingrédients
 * placés sous un titre en font partie.
 */
export function IngredientsEditor({ rows, errors = {}, flags = {}, onChange }: Props) {
  function update(key: string, field: 'name' | 'quantity' | 'unit' | 'note', value: string) {
    onChange(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function remove(key: string) {
    const next = rows.filter((r) => r.key !== key)
    onChange(next.some((r) => !r.heading) ? next : [...next, newIngredientDraft()])
  }

  // Numéros affichés aux lecteurs d'écran : ingrédients et sous-parties comptés à part.
  let ingredientNumber = 0
  let headingNumber = 0

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
          const error = errors[row.key]
          const what = row.heading ? 'la sous-partie' : "l'ingrédient"
          const n = row.heading ? ++headingNumber : ++ingredientNumber
          const moveButtons = (
            <>
              <Button type="button" variant="ghost" size="icon-lg" aria-label={`Monter ${what} ${n}`} disabled={index === 0} onClick={() => onChange(moveItem(rows, index, index - 1))}>
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Descendre ${what} ${n}`}
                disabled={index === rows.length - 1}
                onClick={() => onChange(moveItem(rows, index, index + 1))}
              >
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon-lg" aria-label={`Retirer ${what} ${n}`} onClick={() => remove(row.key)}>
                <X />
              </Button>
            </>
          )

          if (row.heading) {
            return (
              <li key={row.key} data-testid="ingredient-heading" className={cn(index > 0 && 'pt-3')}>
                <div className="flex items-center gap-2">
                  <Heading className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <Input
                    aria-label={`Titre de la sous-partie ${n}`}
                    placeholder="Pour la pâte, pour la sauce…"
                    value={row.name}
                    maxLength={80}
                    aria-invalid={Boolean(error) || undefined}
                    onChange={(e) => update(row.key, 'name', e.target.value)}
                    className="h-10 font-medium"
                  />
                  <div className="flex shrink-0 gap-1">{moveButtons}</div>
                </div>
                {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
              </li>
            )
          }

          return (
            <li
              key={row.key}
              data-testid="ingredient-row"
              data-ingredient-key={row.key}
              className={cn(flags[row.key] && '-mx-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2')}
            >
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
                <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">{moveButtons}</div>
              </div>
              {row.linkedRecipe && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <BookOpen className="size-3.5 shrink-0 text-brand" aria-hidden />
                  <span>Recette liée : {row.linkedRecipe.title}</span>
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    aria-label={`Retirer le lien vers ${row.linkedRecipe.title}`}
                    onClick={() => onChange(rows.map((r) => (r.key === row.key ? { ...r, linkedRecipe: null } : r)))}
                  >
                    Retirer le lien
                  </button>
                </p>
              )}
              {flags[row.key]?.map((message) => <CheckNote key={message} message={message} />)}
              {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={() => onChange([...rows, newIngredientDraft()])}>
          <Plus /> Ajouter un ingrédient
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={() => onChange([...rows, newHeadingDraft(), newIngredientDraft()])}>
          <Heading /> Ajouter une sous-partie
        </Button>
      </div>
    </div>
  )
}

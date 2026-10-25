import { ArrowLeft, ExternalLink, Info, Loader2, Plus, ShoppingCart, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ItemDialog } from '@/components/shopping/ItemDialog'
import { aisleSelectClass } from '@/components/shopping/QuickAddBar'
import { useApi } from '@/app/ApiContext'
import { useOnOpen } from '@/hooks/useOnOpen'
import { useShoppingFromPlan } from '@/hooks/useShoppingFromPlan'
import { formatDay, type IsoDate } from '@/lib/dates'
import { slotLabel, SLOTS, type Meal } from '@/lib/meals'
import { AISLES, defaultListName, formatAmount, type ShoppingItem, type ShoppingList } from '@/lib/shopping'
import { capitalize, defaultSelection, mealSource, SKIP_LABELS, type DraftLine, type MealSource } from '@/lib/shoppingFromPlan'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Repas de la semaine affichée. */
  meals: Meal[]
  today: IsoDate
}

const SOURCE_LABELS: Record<MealSource, string> = {
  recipe: 'Recette',
  link: 'Lien',
  none: 'Sans ingrédients',
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Génère une liste de courses à partir des repas planifiés : choix des repas, aperçu modifiable, destination. */
export function ShoppingFromPlanDialog({ open, onOpenChange, meals, today }: Props) {
  const api = useApi()
  const navigate = useNavigate()
  const flow = useShoppingFromPlan(api)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<DraftLine | null>(null)
  const [lists, setLists] = useState<ShoppingList[] | null>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [listId, setListId] = useState('')

  useOnOpen(open, () => {
    flow.reset()
    setSelected(defaultSelection(meals, today))
    setLists(null)
    setMode('new')
    setName(defaultListName(today))
    setListId('')
  })

  // Listes existantes, chargées à l'arrivée sur l'aperçu (pour « Compléter une liste »).
  useEffect(() => {
    if (flow.step !== 'preview' || lists !== null) return
    api.shopping.listLists().then(
      (data) => {
        setLists(data)
        setListId((id) => id || (data[0]?.id ?? ''))
      },
      () => setLists([]),
    )
  }, [api, flow.step, lists])

  const ordered = useMemo(
    () => [...meals].sort((a, b) => a.meal_date.localeCompare(b.meal_date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
    [meals],
  )
  const days = [...new Set(ordered.map((m) => m.meal_date))]
  const chosen = ordered.filter((m) => selected.has(m.id))

  const toBuy = flow.lines.filter((l) => l.include)
  const groups = AISLES.flatMap(({ value, label }) => {
    const items = flow.lines.filter((l) => !l.pantry && l.aisle === value)
    return items.length > 0 ? [{ value, label, items }] : []
  })
  const pantry = flow.lines.filter((l) => l.pantry)
  const trimmedName = name.trim()
  const nameError = trimmedName.length > 80 ? '80 caractères maximum' : null
  const destinationReady = mode === 'new' ? trimmedName !== '' && !nameError : listId !== ''

  function toggleMeal(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    const result = await flow.submit(mode === 'new' ? { kind: 'new', name: trimmedName } : { kind: 'existing', listId })
    if (!result) return
    onOpenChange(false)
    toast.success(`${plural(result.count, 'article')} ajouté${result.count > 1 ? 's' : ''}`)
    navigate(`/courses/${result.listId}`, { state: { skipped: result.skipped } })
  }

  function close(next: boolean) {
    if (flow.submitting) return
    if (!next) flow.reset()
    onOpenChange(next)
  }

  const editedItem: ShoppingItem | null = editing
    ? { id: editing.id, list_id: '', name: capitalize(editing.name), quantity: editing.quantity, unit: editing.unit, aisle: editing.aisle, checked: false, position: 0 }
    : null

  const lineRow = (line: DraftLine) => {
    const amount = formatAmount(line)
    const label = capitalize(line.name)
    return (
      <li key={line.id} data-testid="draft-line" className="flex min-h-12 items-center gap-1">
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox checked={line.include} onCheckedChange={() => flow.toggle(line.id)} aria-label={`Acheter « ${label} »`} className="size-5" />
        </label>
        <button
          type="button"
          onClick={() => setEditing(line)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', !line.include && 'text-muted-foreground line-through')}>
              <span className="sr-only">Modifier</span> {label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{line.meals.join(', ')}</span>
          </span>
          {amount && <span className={cn('shrink-0 text-sm tabular-nums text-muted-foreground', !line.include && 'line-through')}>{amount}</span>}
        </button>
      </li>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Liste de courses</DialogTitle>
            <DialogDescription>
              {flow.step === 'meals'
                ? 'Choisis les repas à prendre en compte.'
                : flow.step === 'loading'
                  ? 'Préparation de la liste…'
                  : 'Vérifie la liste : décoche ce que tu as déjà.'}
            </DialogDescription>
          </DialogHeader>

          {flow.step === 'meals' && (
            <>
              {ordered.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">Aucun repas planifié cette semaine.</p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelected(new Set(ordered.map((m) => m.id)))}>
                      Tout cocher
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                      Tout décocher
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {days.map((day) => (
                      <section key={day} aria-label={formatDay(day)}>
                        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatDay(day)}</h3>
                        <ul className="divide-y rounded-xl border">
                          {ordered
                            .filter((m) => m.meal_date === day)
                            .map((meal) => {
                              const source = mealSource(meal)
                              return (
                                <li key={meal.id}>
                                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                                    <Checkbox checked={selected.has(meal.id)} onCheckedChange={() => toggleMeal(meal.id)} className="size-5" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-medium">{meal.recipe.title}</span>
                                      <span className="block text-xs text-muted-foreground">
                                        {slotLabel(meal.slot)} · {meal.people.length} pers.
                                      </span>
                                    </span>
                                    <Badge variant={source === 'none' ? 'outline' : 'secondary'} className={cn(source === 'none' && 'text-muted-foreground')}>
                                      {SOURCE_LABELS[source]}
                                    </Badge>
                                  </label>
                                </li>
                              )
                            })}
                        </ul>
                      </section>
                    ))}
                  </div>
                  <p className="flex gap-2 text-xs text-muted-foreground">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                    Les ingrédients des liens sont lus sur la page de la recette ; les repas sans ingrédients seront listés à part.
                  </p>
                </>
              )}
              <DialogFooter>
                <Button variant="outline" className="h-10" onClick={() => close(false)}>
                  Annuler
                </Button>
                <Button className="h-10" disabled={chosen.length === 0} onClick={() => void flow.prepare(chosen)}>
                  <ShoppingCart /> Préparer la liste ({chosen.length} repas)
                </Button>
              </DialogFooter>
            </>
          )}

          {flow.step === 'loading' && (
            <div className="space-y-3" aria-busy="true">
              <p role="status" className="flex items-center gap-2 font-medium">
                <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
                {flow.phase === 'recipes' ? 'Lecture des recettes…' : 'Regroupement…'}
              </p>
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
              <DialogFooter>
                <Button variant="outline" className="h-10" onClick={flow.back}>
                  <ArrowLeft /> Retour
                </Button>
              </DialogFooter>
            </div>
          )}

          {flow.step === 'preview' && (
            <>
              {flow.tidyFailed && (
                <p className="flex gap-2 rounded-xl border bg-muted/50 p-3 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  Regroupement automatique indisponible : les articles sont regroupés sans l'assistant.
                </p>
              )}
              {flow.unscaled.length > 0 && (
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                  Quantités non adaptées au nombre de personnes (non précisé dans la recette) : {flow.unscaled.join(', ')}.
                </p>
              )}

              {flow.lines.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">Aucun ingrédient trouvé.</p>}

              {groups.map((group) => (
                <section key={group.value} aria-labelledby={`draft-${group.value}`}>
                  <h3 id={`draft-${group.value}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </h3>
                  <ul className="divide-y">{group.items.map(lineRow)}</ul>
                </section>
              ))}

              {pantry.length > 0 && (
                <section aria-labelledby="draft-pantry" className="rounded-xl border border-dashed px-2 py-2">
                  <h3 id="draft-pantry" className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Placard
                  </h3>
                  <p className="px-2 text-xs text-muted-foreground">Basiques qu'on a en général déjà : coche ceux qui manquent.</p>
                  <ul className="divide-y">{pantry.map(lineRow)}</ul>
                </section>
              )}

              {flow.skipped.length > 0 && (
                <section aria-labelledby="draft-skipped" className="rounded-xl border border-brand/25 bg-brand/5 p-3">
                  <h3 id="draft-skipped" className="text-sm font-medium">
                    Non repris ({flow.skipped.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">À compléter à la main.</p>
                  <ul className="mt-2 space-y-2">
                    {flow.skipped.map((entry) => (
                      <li key={entry.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{entry.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {SKIP_LABELS[entry.reason]} · {entry.detail}
                          </span>
                        </span>
                        {entry.url && (
                          <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                            <ExternalLink className="size-3.5" aria-hidden /> Ouvrir <span className="sr-only">la recette « {entry.label} »</span>
                          </a>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => flow.addSkipped(entry)}>
                          <Plus /> Ajouter <span className="sr-only">« {entry.label} » comme article</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <fieldset className="space-y-3 border-t pt-4">
                <legend className="sr-only">Destination</legend>
                <div className="grid grid-cols-2 gap-1 rounded-lg border p-1" role="radiogroup" aria-label="Destination">
                  {(['new', 'existing'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={mode === value}
                      disabled={value === 'existing' && lists !== null && lists.length === 0}
                      onClick={() => setMode(value)}
                      className={cn(
                        'h-9 rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
                        mode === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                      )}
                    >
                      {value === 'new' ? 'Nouvelle liste' : 'Compléter une liste'}
                    </button>
                  ))}
                </div>
                {mode === 'new' ? (
                  <div className="space-y-2">
                    <Label htmlFor="plan-list-name">Nom de la liste</Label>
                    <Input id="plan-list-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(nameError) || undefined} className="h-10" />
                    {nameError && <p className="text-sm text-destructive">{nameError}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="plan-list">Liste à compléter</Label>
                    <select id="plan-list" value={listId} onChange={(e) => setListId(e.target.value)} className={aisleSelectClass}>
                      {(lists ?? []).map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Les quantités s'ajoutent aux articles déjà sur la liste.</p>
                  </div>
                )}
              </fieldset>

              <DialogFooter>
                <Button variant="outline" className="h-10" onClick={flow.back} disabled={flow.submitting}>
                  <ArrowLeft /> Retour
                </Button>
                <Button className="h-10" disabled={flow.submitting || toBuy.length === 0 || !destinationReady} onClick={() => void submit()}>
                  {flow.submitting && <Loader2 className="animate-spin" aria-hidden />}
                  {mode === 'new' ? 'Créer la liste' : 'Ajouter'} ({plural(toBuy.length, 'article')})
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ItemDialog
        item={editedItem}
        onOpenChange={(next) => !next && setEditing(null)}
        onSubmit={async (item, input) => {
          flow.update(item.id, input)
          return true
        }}
        onDelete={(item) => {
          if (flow.lines.find((l) => l.id === item.id)?.include) flow.toggle(item.id)
          setEditing(null)
        }}
      />
    </>
  )
}

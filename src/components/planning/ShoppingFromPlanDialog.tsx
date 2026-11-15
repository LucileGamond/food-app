import { ArrowLeft, Info, Loader2, RefreshCw, ShoppingCart } from 'lucide-react'
import { AiIcon } from '@/components/AiIcon'
import { useMemo, useRef, useState } from 'react'
import { errorMessage } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ShoppingDraftPreview } from '@/components/shopping/ShoppingDraftPreview'
import { useApi } from '@/app/ApiContext'
import { useOnOpen } from '@/hooks/useOnOpen'
import { useShoppingFromPlan } from '@/hooks/useShoppingFromPlan'
import { addDays, formatDay, type IsoDate } from '@/lib/dates'
import { slotLabel, SLOTS, type Meal } from '@/lib/meals'
import { isLeftover, mealSource, type MealSource } from '@/lib/shoppingFromPlan'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  today: IsoDate
}

/** Repas à venir pris en compte : tout ce qui est planifié dans l'année qui vient. */
const UPCOMING_DAYS = 366

const SOURCE_LABELS: Record<MealSource, string> = {
  recipe: 'Recette',
  link: 'Lien',
  none: 'Sans ingrédients',
}

/** Génère une liste de courses à partir des repas planifiés : choix des repas, aperçu modifiable, destination. */
export function ShoppingFromPlanDialog({ open, onOpenChange, today }: Props) {
  const api = useApi()
  const flow = useShoppingFromPlan(api)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  /** Tous les repas à venir (pas seulement la semaine affichée), tous cochés. */
  const [meals, setMeals] = useState<Meal[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadRun = useRef(0)

  function load() {
    const run = ++loadRun.current
    setMeals(null)
    setLoadError(null)
    api.meals.listMeals(today, addDays(today, UPCOMING_DAYS)).then(
      (list) => {
        if (run !== loadRun.current) return
        setMeals(list)
        setSelected(new Set(list.filter((m) => !isLeftover(m)).map((m) => m.id)))
      },
      (error: unknown) => run === loadRun.current && setLoadError(errorMessage(error)),
    )
  }

  useOnOpen(open, () => {
    flow.reset()
    load()
  })

  const ordered = useMemo(
    () => [...(meals ?? [])].sort((a, b) => a.meal_date.localeCompare(b.meal_date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
    [meals],
  )
  const days = [...new Set(ordered.map((m) => m.meal_date))]
  const chosen = ordered.filter((m) => selected.has(m.id))

  function toggleMeal(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close(next: boolean) {
    if (flow.submitting) return
    if (!next) flow.reset()
    onOpenChange(next)
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
              {loadError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p className="text-destructive">{loadError}</p>
                  <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw /> Réessayer
                  </Button>
                </div>
              ) : meals === null ? (
                <div className="space-y-2" aria-busy="true" aria-label="Chargement des repas à venir">
                  <Skeleton className="h-12 rounded-xl" />
                  <Skeleton className="h-12 rounded-xl" />
                </div>
              ) : ordered.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">Aucun repas planifié à venir.</p>
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
                                        {isLeftover(meal) ? ' · restes, rien à acheter' : meal.portions ? ` · ${meal.portions} portion${meal.portions > 1 ? 's' : ''}` : ''}
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
                  <ShoppingCart /> Préparer la liste ({chosen.length} repas) <AiIcon className="opacity-70" />
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

          {flow.step === 'preview' && <ShoppingDraftPreview flow={flow} today={today} backLabel="Retour" onBack={flow.back} onDone={() => onOpenChange(false)} />}
        </DialogContent>
      </Dialog>

    </>
  )
}

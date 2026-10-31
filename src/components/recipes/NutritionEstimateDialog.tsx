import { Flame, Loader2, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useOnOpen } from '@/hooks/useOnOpen'
import type { NutritionEstimate } from '@/lib/nutritionEstimate'
import { formatQuantity, type Recipe } from '@/lib/recipes'

interface Props {
  /** Recette dont on calcule les valeurs (null : fenêtre fermée). */
  recipe: Recipe | null
  onOpenChange: (open: boolean) => void
  /** Valeurs enregistrées. */
  onSaved: (estimate: NutritionEstimate) => void
}

type State = { kind: 'loading' } | { kind: 'ready'; estimate: NutritionEstimate } | { kind: 'error'; message: string }

/** Calories et macros calculées d'après la table Ciqual : détail par ingrédient, enregistrées seulement si on valide. */
export function NutritionEstimateDialog({ recipe, onOpenChange, onSaved }: Props) {
  const api = useApi()
  const open = recipe !== null
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  // Une fenêtre fermée ou un calcul relancé rend le précédent obsolète.
  const requestId = useRef(0)

  async function run() {
    if (!recipe) return
    const id = ++requestId.current
    setState({ kind: 'loading' })
    try {
      const estimate = await api.recipes.estimateNutrition(recipe)
      if (id === requestId.current) setState({ kind: 'ready', estimate })
    } catch (e) {
      if (id === requestId.current) setState({ kind: 'error', message: errorMessage(e) })
    }
  }

  useOnOpen(open, () => void run())

  function close(next: boolean) {
    if (saving) return
    if (!next) requestId.current += 1
    onOpenChange(next)
  }

  async function save() {
    if (!recipe || state.kind !== 'ready') return
    setSaving(true)
    try {
      await api.recipes.saveNutrition(recipe.id, state.estimate)
      toast.success('Calories enregistrées')
      onSaved(state.estimate)
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const per = state.kind === 'ready' && state.estimate.per === 'recette' ? 'pour toute la recette' : 'par portion'

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flame className="size-5" aria-hidden /> Calories et macros
          </DialogTitle>
          <DialogDescription>Estimation d’après la table Ciqual de l’ANSES. Rien n’est enregistré tant que tu ne valides pas.</DialogDescription>
        </DialogHeader>

        {state.kind === 'loading' && (
          <div className="space-y-3" aria-busy="true" aria-label="Calcul en cours">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{state.message}</p>
            <Button variant="outline" onClick={() => void run()}>
              <RefreshCw /> Réessayer
            </Button>
          </div>
        )}

        {state.kind === 'ready' && (
          <div className="space-y-4">
            <section aria-label={`Valeurs ${per}`}>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Calories', `${state.estimate.kcal} kcal`],
                  ['Glucides', `${formatQuantity(state.estimate.carbs)} g`],
                  ['Protéines', `${formatQuantity(state.estimate.protein)} g`],
                  ['Lipides', `${formatQuantity(state.estimate.fat)} g`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-muted/40 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 text-xs text-muted-foreground">{per[0]!.toUpperCase() + per.slice(1)}.</p>
            </section>

            <section aria-labelledby="estimate-detail">
              <h3 id="estimate-detail" className="mb-1 text-sm font-medium">
                Détail par ingrédient
              </h3>
              <ul className="divide-y text-sm">
                {state.estimate.ingredients.map((ingredient, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p>{ingredient.name}</p>
                      <p className="text-xs break-words text-muted-foreground">
                        {ingredient.food ? ingredient.food.name : 'Non reconnu'}
                        {ingredient.grams !== null && ` · ${ingredient.grams} g`}
                      </p>
                    </div>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{ingredient.kcal !== null ? `${ingredient.kcal} kcal` : 'non compté'}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-10" disabled={saving} onClick={() => close(false)}>
            Annuler
          </Button>
          <Button className="h-10" disabled={state.kind !== 'ready' || saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ShoppingDraftPreview } from '@/components/shopping/ShoppingDraftPreview'
import { useApi } from '@/app/ApiContext'
import { useOnOpen } from '@/hooks/useOnOpen'
import { useShoppingFromPlan } from '@/hooks/useShoppingFromPlan'
import { todayIso } from '@/lib/dates'
import type { Recipe } from '@/lib/recipes'

interface Props {
  recipe: Recipe | null
  /** Nombre de personnes choisi sur la fiche (null : quantités de la recette). */
  people: number | null
  onOpenChange: (open: boolean) => void
}

/** Ingrédients d'une recette ajoutés aux courses : aperçu par rayon, puis nouvelle liste ou liste à compléter. */
export function RecipeShoppingDialog({ recipe, people, onOpenChange }: Props) {
  const api = useApi()
  const flow = useShoppingFromPlan(api)
  const open = recipe !== null

  useOnOpen(open, () => {
    flow.reset()
    if (!recipe) return
    void flow.prepareIngredients([{ title: recipe.title, people: people ?? recipe.servings ?? 0, servings: recipe.servings, ingredients: recipe.ingredients }])
  })

  function close(next: boolean) {
    if (flow.submitting) return
    if (!next) flow.reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter aux courses</DialogTitle>
          <DialogDescription>
            {recipe?.title}
            {people !== null && ` · ${people} ${people > 1 ? 'personnes' : 'personne'}`}. Décoche ce que tu as déjà.
          </DialogDescription>
        </DialogHeader>

        {flow.step === 'preview' ? (
          <ShoppingDraftPreview flow={flow} today={todayIso()} backLabel="Annuler" onBack={() => close(false)} onDone={() => onOpenChange(false)} />
        ) : (
          <div className="space-y-3" aria-busy="true">
            <p role="status" className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> Regroupement…
            </p>
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <DialogFooter>
              <Button variant="outline" className="h-10" onClick={() => close(false)}>
                Annuler
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

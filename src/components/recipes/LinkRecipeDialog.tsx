import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RecipePicker } from '@/components/planning/RecipePicker'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import type { RecipeSummary } from '@/lib/meals'
import type { LinkedRecipe, PendingLink } from '@/lib/recipes'

interface Props {
  /** Ingrédient à lier ; null : fenêtre fermée. */
  reference: PendingLink | null
  /** Recette principale (exclue du choix). */
  recipeId: string
  onClose: () => void
  onLink: (reference: PendingLink, recipe: LinkedRecipe) => Promise<void>
}

/** Choix d'une recette déjà enregistrée pour un ingrédient qui renvoie à une autre recette. */
export function LinkRecipeDialog({ reference, recipeId, onClose, onLink }: Props) {
  const api = useApi()
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const open = reference !== null

  useEffect(() => {
    if (!open) return
    let active = true
    setSelected(null)
    setRecipes(null)
    api.recipes.listSavedSummaries().then(
      (list) => active && setRecipes(list.filter((r) => r.id !== recipeId)),
      (e: unknown) => {
        if (!active) return
        toast.error(errorMessage(e))
        onClose()
      },
    )
    return () => {
      active = false
    }
  }, [api, open, recipeId, onClose])

  async function confirm() {
    const recipe = recipes?.find((r) => r.id === selected)
    if (!reference || !recipe) return
    setSaving(true)
    try {
      await onLink(reference, { id: recipe.id, title: recipe.title })
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lier à une recette</DialogTitle>
          <DialogDescription>
            {reference ? `« ${reference.name} » (${reference.page}) renvoie à quelle recette ?` : ''}
          </DialogDescription>
        </DialogHeader>
        <RecipePicker recipes={recipes} value={selected} onChange={setSelected} />
        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={onClose}>
            Annuler
          </Button>
          <Button className="h-10" disabled={!selected || saving} onClick={() => void confirm()}>
            Lier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { TriangleAlert, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ImportCheck } from '@/lib/importChecks'
import type { RecipeFormValues } from '@/lib/recipes'
import { cn } from '@/lib/utils'

interface Props {
  checks: ImportCheck[]
  values: RecipeFormValues
  /** Photos lues (aperçus locaux), pour comparer avec le formulaire ; jamais enregistrées. */
  pages?: string[]
  onDismiss: () => void
}

/** Champ du formulaire concerné par un point à vérifier (pour y aller d'un geste). */
function targetOf(check: ImportCheck): string {
  if (check.ingredientKey) return `[data-ingredient-key="${check.ingredientKey}"] input`
  return check.field === 'servings' ? '#recipe-servings' : '#recipe-notes'
}

/** Ce qui paraît à vérifier après l'import, chaque point menant au champ concerné, et la photo lue. */
export function ImportReview({ checks, values, pages = [], onDismiss }: Props) {
  const [viewing, setViewing] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)
  if (checks.length === 0 && pages.length === 0) return null

  const subject = (check: ImportCheck) => {
    if (check.ingredientKey) {
      const rows = values.ingredients.filter((r) => !r.heading)
      const index = rows.findIndex((r) => r.key === check.ingredientKey)
      return rows[index]?.name.trim() || `Ingrédient ${index + 1}`
    }
    if (check.field === 'servings') return 'Portions'
    if (check.field === 'notes') return 'Étapes'
    return 'Recette'
  }

  function focus(check: ImportCheck) {
    const field = document.querySelector<HTMLElement>(targetOf(check))
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field?.focus({ preventScroll: true })
  }

  return (
    <section aria-labelledby="import-review-title" className="rounded-2xl border border-brand/25 bg-background p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="import-review-title" className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4 text-brand" aria-hidden />
            {checks.length > 0 ? `À vérifier (${checks.length})` : 'Vérifie la recette'}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {checks.length > 0 ? 'Chaque point disparaît une fois la ligne corrigée.' : 'Compare avec la photo avant d’enregistrer.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Masquer les points à vérifier" onClick={onDismiss}>
          <X />
        </Button>
      </div>

      {pages.length > 0 && (
        <ul className="mt-3 flex gap-2" aria-label="Photos lues">
          {pages.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => {
                  setZoomed(false)
                  setViewing(index)
                }}
                className="block overflow-hidden rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <img src={url} alt={`Agrandir la page ${index + 1}`} className="h-20 w-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {checks.length > 0 && (
        <ul className="mt-2 divide-y" aria-label="Points à vérifier">
          {checks.map((check) => (
            <li key={check.key}>
              <button
                type="button"
                onClick={() => focus(check)}
                className="w-full rounded-md px-1 py-2 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="font-medium">{subject(check)}</span>
                <span className="text-muted-foreground"> · {check.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 sm:max-w-3xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 pr-8">
            <DialogTitle>Page {viewing === null ? '' : viewing + 1}</DialogTitle>
            <Button variant="outline" size="sm" onClick={() => setZoomed((z) => !z)}>
              {zoomed ? <ZoomOut /> : <ZoomIn />}
              {zoomed ? 'Réduire' : 'Agrandir'}
            </Button>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-8rem)] overflow-auto rounded-lg border bg-muted">
            {viewing !== null && pages[viewing] && (
              <img src={pages[viewing]} alt={`Page ${viewing + 1} de la recette`} className={cn('max-w-none', zoomed ? 'w-[200%]' : 'w-full')} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

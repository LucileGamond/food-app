import { CheckCircle2, CircleAlert, CircleDashed, CopyCheck, Loader2, MinusCircle, RotateCcw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { BatchItem, BatchStatus, RecipeOutcome } from '@/lib/batchImport'
import { cn } from '@/lib/utils'

type StatusStyle = { label: string; icon: typeof CheckCircle2; className: string }

/** État de l'image (avant lecture, ou sans recette lisible). */
const IMAGE_STATUS: Record<Exclude<BatchStatus, 'done'>, StatusStyle> = {
  pending: { label: 'En attente', icon: CircleDashed, className: 'text-muted-foreground' },
  reading: { label: 'Lecture…', icon: Loader2, className: 'animate-spin text-brand' },
  skipped: { label: 'Ignorée', icon: MinusCircle, className: 'text-muted-foreground' },
  error: { label: 'Erreur', icon: CircleAlert, className: 'text-destructive' },
}

/** Résultat de chaque recette lue sur l'image. */
const RECIPE_STATUS: Record<RecipeOutcome, StatusStyle> = {
  saved: { label: 'Enregistrée', icon: CheckCircle2, className: 'text-brand' },
  duplicate: { label: 'Déjà enregistrée', icon: CopyCheck, className: 'text-muted-foreground' },
  incomplete: { label: 'À compléter à la main', icon: TriangleAlert, className: 'text-amber-700 dark:text-amber-400' },
  error: { label: 'Erreur', icon: CircleAlert, className: 'text-destructive' },
}

/** Une ligne de résultat : icône, titre éventuel, état et précision. */
function StatusLine({ style, message, error, children }: { style: StatusStyle; message?: string; error: boolean; children?: React.ReactNode }) {
  const Icon = style.icon
  return (
    <li className="flex items-start gap-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', style.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        {children}
        <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {style.label}
          {message && message !== style.label && ` · ${message}`}
        </p>
      </div>
    </li>
  )
}

export type BatchResultItem = Pick<BatchItem, 'key' | 'status' | 'message' | 'recipes'> & {
  label: string
  /** Action proposée sous la ligne (ex. « C'est une recette » pour une page ignorée). */
  action?: { label: string; onClick: () => void }
  /** Miniature de la photo (adresse d'objet), pour juger d'un coup d'œil. */
  thumbnail?: string
}

/** Résultat de l'import, image par image (ou groupe de photos par groupe) : recettes enregistrées, ignorées, erreurs. */
export function BatchResults({ items, label }: { items: BatchResultItem[]; label: string }) {
  return (
    <ul className="divide-y rounded-2xl border bg-background shadow-xs" aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className="flex gap-3 px-4 py-3 text-sm" data-testid="batch-item">
          {item.thumbnail && <img src={item.thumbnail} alt={`Photo : ${item.label}`} className="h-20 w-15 shrink-0 rounded border object-cover" />}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-xs text-muted-foreground">
              {item.label}
              {item.recipes.length > 1 && ` · ${item.recipes.length} recettes`}
            </p>
            {item.status === 'done' ? (
              <ul className="space-y-1.5">
                {item.recipes.map((recipe, i) => (
                  <StatusLine key={i} style={RECIPE_STATUS[recipe.status]} message={recipe.photo ? 'avec la photo du plat' : recipe.message} error={recipe.status === 'error'}>
                    {recipe.recipeId ? (
                      <Link to={`/recettes/${recipe.recipeId}`} className="font-medium underline-offset-4 hover:underline">
                        {recipe.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{recipe.title}</span>
                    )}
                  </StatusLine>
                ))}
              </ul>
            ) : (
              <ul>
                <StatusLine style={IMAGE_STATUS[item.status]} message={item.message} error={item.status === 'error'} />
              </ul>
            )}
            {item.action && (
              <Button variant="outline" size="sm" className="h-9" onClick={item.action.onClick}>
                <RotateCcw /> {item.action.label}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

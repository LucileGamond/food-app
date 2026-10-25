import { ExternalLink, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatAmount, type ShoppingItemInput } from '@/lib/shopping'
import { SKIP_LABELS, skippedInput, type SkippedEntry } from '@/lib/shoppingFromPlan'

interface Props {
  entries: SkippedEntry[]
  onAdd: (entry: SkippedEntry, input: ShoppingItemInput) => void
  onDismiss: () => void
}

/** Ce que la génération depuis le planning n'a pas mis tel quel dans la liste (repas, articles décochés ou incomplets). */
export function SkippedPanel({ entries, onAdd, onDismiss }: Props) {
  return (
    <section aria-labelledby="skipped-title" className="mt-4 rounded-2xl border border-brand/25 bg-brand/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="skipped-title" className="text-sm font-medium">
            À vérifier ({entries.length})
          </h2>
          <p className="text-xs text-muted-foreground">Ce que le planning n'a pas pu mettre tel quel dans la liste : à compléter si besoin.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fermer « À vérifier »" onClick={onDismiss}>
          <X />
        </Button>
      </div>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => {
          const amount = entry.input ? formatAmount(entry.input) : ''
          return (
            <li key={entry.key} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
              <span className="min-w-0 sm:flex-1">
                <span className="block truncate font-medium">
                  {entry.label}
                  {amount && <span className="font-normal text-muted-foreground"> · {amount}</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {SKIP_LABELS[entry.reason]}
                  {entry.detail && ` · ${entry.detail}`}
                </span>
              </span>
              <div className="flex items-center gap-3">
                {entry.url && (
                  <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                    <ExternalLink className="size-3.5" aria-hidden /> Ouvrir <span className="sr-only">la recette « {entry.label} »</span>
                  </a>
                )}
                {entry.reason !== 'to-check' && (
                  <Button variant="ghost" size="sm" onClick={() => onAdd(entry, skippedInput(entry))}>
                    <Plus /> Ajouter <span className="sr-only">« {entry.label} »</span>
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

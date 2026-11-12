import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SubstepCount } from '../../lib/substeps'

interface Props {
  counts: SubstepCount[]
  /** Nombre de sous-étapes de l'étape. */
  total: number
  /** Finir la sous-étape après les rangs déjà tricotés. */
  onFinish: (count: SubstepCount) => void
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Compteur de chaque sous-étape en cours : son rang, sa longueur, et la finir quand elle se mesure (« jusqu'à 30 cm »). */
export function SubstepCounters({ counts, total, onFinish }: Props) {
  if (!counts.length) return null
  return (
    <ul aria-label="Sous-étapes en cours" className="space-y-2">
      {counts.map((count) => {
        const knitted = count.row - 1
        // Longueur inconnue : finir quand on y est ; connue : seulement avant la fin (finir plus tôt).
        const canFinish = count.finishable && knitted > 0 && (count.rows === null || knitted < count.rows)
        return (
          <li key={count.index} className="rounded-2xl border bg-background p-3">
            <p className="text-xs text-muted-foreground">
              Sous-étape {count.index + 1} sur {total}
            </p>
            <p className="text-sm font-medium">{count.title}</p>
            <p className="mt-1 text-sm tabular-nums">
              <span className="text-lg font-semibold">Rang {count.row}</span>
              {count.rows !== null ? <span className="text-muted-foreground"> sur {count.rows}</span> : <span className="text-muted-foreground"> · longueur à mesurer</span>}
            </p>
            {count.rows !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (knitted / count.rows) * 100)}%` }} />
              </div>
            )}
            {canFinish && (
              <Button variant="outline" className="mt-2 h-9" onClick={() => onFinish(count)}>
                <Check /> Sous-étape finie ({plural(knitted, 'rang')})
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

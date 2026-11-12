import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_ROW_COUNT } from '../../lib/pattern'
import { formatNeedle } from '../../lib/needles'
import type { SubstepCount } from '../../lib/substeps'

interface Props {
  rowCount: number
  totalRows: number | null
  onCount: (delta: number) => void
  /** Sous-étapes en cours (plusieurs avec « en même temps ») : le compteur montre la première. */
  substeps?: SubstepCount[]
  /** Finir la sous-étape (longueur mesurée) après les rangs tricotés. */
  onFinishSubstep?: (count: SubstepCount) => void
  /** Aiguille de la sous-étape en cours (mm). */
  needle?: number | null
}

/**
 * Le compteur du mode tricoter, en bas de l'écran sous le pouce : gros +1, petit −1. Il compte dans la sous-étape en
 * cours (« 5 / 16 rangs · côtes ») ; le rang de l'étape et les autres sous-étapes « en même temps » sont rappelés en petit.
 */
export function ModeCounter({ rowCount, totalRows, onCount, substeps = [], onFinishSubstep, needle = null }: Props) {
  const [main, ...parallel] = substeps
  const knitted = main ? main.row - 1 : rowCount
  const total = main ? main.rows : totalRows
  // Longueur à mesurer : on la finit quand on y est ; connue : seulement avant la fin (finir plus tôt).
  const canFinish = !!main && !!onFinishSubstep && main.finishable && knitted > 0 && (main.rows === null || knitted < main.rows)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-lg" aria-label="Retirer un rang" disabled={rowCount === 0} onClick={() => onCount(-1)}>
          <Minus />
        </Button>
        <p className="min-w-0 flex-1 text-center text-sm text-muted-foreground" aria-live="polite">
          <span className="block text-2xl font-semibold text-foreground tabular-nums">
            {knitted}
            {total !== null && <span className="text-base font-normal text-muted-foreground"> / {total}</span>}
          </span>
          <span className="block truncate">{['rangs faits', needle !== null && `aig. ${formatNeedle(needle)}`, main?.title].filter(Boolean).join(' · ')}</span>
        </p>
        <Button className="h-14 px-6 text-base" disabled={rowCount >= MAX_ROW_COUNT} onClick={() => onCount(1)}>
          <Plus />
          <span className="sr-only">Ajouter</span> 1 rang
        </Button>
      </div>
      {main && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>
            Étape : {rowCount}
            {totalRows !== null && ` / ${totalRows}`} rangs
          </span>
          {parallel.map((p) => (
            <span key={p.index} className="max-w-full truncate">
              En même temps : {p.row - 1}
              {p.rows !== null && ` / ${p.rows}`} · {p.title}
            </span>
          ))}
          {canFinish && (
            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => onFinishSubstep(main)}>
              <Check /> Sous-étape finie ({knitted} rang{knitted > 1 ? 's' : ''})
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

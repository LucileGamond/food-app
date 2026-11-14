import { cn } from '@/lib/utils'
import { Check, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_ROW_COUNT, withoutAtPrefix } from '../../lib/pattern'
import { formatNeedle } from '../../lib/needles'
import type { SubstepCount } from '../../lib/substeps'
import { TOUCH_AREA } from '../../lib/touch'
import { YarnGauge } from '../YarnGauge'

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
  /** Couleurs de la laine du projet (jauge pelote et fil) ; indigo si aucune. */
  hues?: string[]
  /** Enroulement de la pelote, propre au projet. */
  seed?: number
}

/**
 * Le compteur du mode tricoter, en bas de l'écran sous le pouce : gros +1, petit −1. Il compte dans la sous-étape en
 * cours (« 5 / 16 rangs · côtes ») ; le rang de l'étape et les autres sous-étapes « en même temps » sont rappelés en petit.
 */
export function ModeCounter({ rowCount, totalRows, onCount, substeps = [], onFinishSubstep, needle = null, hues = [], seed = 1 }: Props) {
  const [main, ...parallel] = substeps
  const knitted = main ? main.row - 1 : rowCount
  const total = main ? main.rows : totalRows
  // Longueur à mesurer : on la finit quand on y est ; connue : seulement avant la fin (finir plus tôt).
  const canFinish = !!main && !!onFinishSubstep && main.finishable && knitted > 0 && (main.rows === null || knitted < main.rows)
  // La ligne « Étape » ne dit quelque chose que si elle diffère du compteur (sinon c'est le même nombre deux fois).
  const stepDiffers = knitted !== rowCount || total !== totalRows
  const below = !!main && (stepDiffers || parallel.length > 0 || canFinish)
  return (
    <div className="space-y-2">
      {/* L'aiguille d'abord : c'est le titre, long, qui se coupe, jamais l'aiguille (V5a). */}
      {(main?.title || needle !== null) && (
        <p className="flex min-w-0 gap-1 text-xs text-muted-foreground">
          {needle !== null && <span className="shrink-0 font-medium text-foreground">Aig. {formatNeedle(needle)}</span>}
          {needle !== null && main?.title && <span aria-hidden>·</span>}
          {main?.title && <span className="truncate">{main.title}</span>}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon-lg" aria-label="Retirer un rang" disabled={rowCount === 0} onClick={() => onCount(-1)}>
          <Minus />
        </Button>
        <p className="min-w-0 flex-1 text-center" aria-live="polite">
          <span className="knit-name text-3xl tabular-nums">{knitted}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{total === null ? ' rangs faits' : ` sur ${total} rangs`}</span>
        </p>
        <Button className="h-14 px-6 text-base" disabled={rowCount >= MAX_ROW_COUNT} onClick={() => onCount(1)}>
          <Plus />
          <span className="sr-only">Ajouter</span> 1 rang
        </Button>
      </div>
      {total !== null && <YarnGauge done={knitted} total={total} hues={hues} seed={seed} className="max-h-11" />}
      {below && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {stepDiffers && (
            <span>
              {rowCount}
              {totalRows !== null && ` / ${totalRows}`} rangs dans l’étape
            </span>
          )}
          {parallel.map((p) => (
            // Les nombres d'abord, puis le nom sans son « En même temps, dès le rang … : » (déjà dit) (V5b).
            <span key={p.index} className="max-w-full truncate">
              En même temps : {p.row - 1}
              {p.rows !== null && ` / ${p.rows}`} · {withoutAtPrefix(p.title)}
            </span>
          ))}
          {canFinish && (
            <Button variant="ghost" className={cn('relative h-7 px-2 text-xs', TOUCH_AREA)} onClick={() => onFinishSubstep(main)}>
              <Check /> Terminer la sous-étape ({knitted} rang{knitted > 1 ? 's' : ''})
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

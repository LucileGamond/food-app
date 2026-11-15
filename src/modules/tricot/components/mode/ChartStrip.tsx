import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { rowBand, type ChartRow, type KnitChart } from '../../lib/chart'

interface Props {
  chart: KnitChart
  position: ChartRow
  onOpen: () => void
}

/** Marge autour de la bande, en part de la hauteur d'un rang : on devine les rangs voisins. */
const MARGIN = 0.35

/**
 * Bande découpée dans l'image du diagramme : seulement le rang à tricoter, surligné. Le sens de lecture est une
 * flèche à côté de la bande (pas dessus, pour ne rien cacher du diagramme), du côté où le rang commence. Touchée,
 * la bande ouvre le diagramme en plein écran.
 */
export function ChartStrip({ chart, position, onOpen }: Props) {
  // Proportions de l'image, connues une fois chargée (une bande large par défaut).
  const [ratio, setRatio] = useState<number | null>(null)
  const band = rowBand(chart, position.line)
  const rowHeight = band.bottom - band.top
  const top = Math.max(0, band.top - rowHeight * MARGIN)
  const bottom = Math.min(1, band.bottom + rowHeight * MARGIN)
  const height = bottom - top
  const name = chart.title || 'Diagramme'
  const Arrow = position.direction === 'rtl' ? ArrowLeft : ArrowRight
  if (!chart.imageUrl) return null
  // Rang dessiné : la flèche part du côté où l'on commence (à droite pour un rang lu de droite à gauche).
  const side = position.drawn ? (position.direction === 'rtl' ? 'right' : 'left') : null
  const arrow = (at: 'left' | 'right') => (
    <span className="flex w-6 shrink-0 justify-center" aria-hidden>
      {side === at && (
        <span data-testid="chart-direction" data-side={at} className="flex size-6 items-center justify-center rounded-full bg-brand text-white shadow">
          <Arrow className="size-4" />
        </span>
      )}
    </span>
  )
  return (
    <div className="flex items-center gap-1">
      {arrow('left')}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Voir ${name} en grand`}
        className="relative block min-w-0 flex-1 overflow-hidden rounded-lg border bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        style={{ aspectRatio: ratio ? `${ratio} / ${height}` : '8 / 1' }}
        data-testid="chart-strip"
      >
        <img
          src={chart.imageUrl}
          alt=""
          draggable={false}
          onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          className="absolute left-0 w-full max-w-none select-none"
          style={{ height: `${100 / height}%`, top: `${(-top / height) * 100}%` }}
        />
        <span
          className={cn('pointer-events-none absolute inset-x-0 border-y-2 border-brand', position.drawn ? 'bg-brand/20' : 'border-dashed bg-brand/5')}
          style={{ top: `${((band.top - top) / height) * 100}%`, height: `${(rowHeight / height) * 100}%` }}
          aria-hidden
        />
      </button>
      {arrow('right')}
    </div>
  )
}

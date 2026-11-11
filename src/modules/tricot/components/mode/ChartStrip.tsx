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
 * Bande découpée dans l'image du diagramme : seulement le rang à tricoter, surligné, avec le sens de lecture.
 * Touchée, elle ouvre le diagramme en plein écran.
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
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Voir ${name} en grand`}
      className="relative block w-full overflow-hidden rounded-lg border bg-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
      >
        {position.drawn && (
          <span className={cn('absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-white shadow', position.direction === 'rtl' ? 'right-1' : 'left-1')}>
            <Arrow className="size-3.5" />
          </span>
        )}
      </span>
    </button>
  )
}

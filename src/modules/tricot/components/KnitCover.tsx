import { cn } from '@/lib/utils'
import { jacquard, JACQUARD_SIZE } from '../lib/jacquard'
import { seedOf, shade } from '../lib/yarnGauge'

const CELL = 5

/**
 * Couverture d'un patron sans photo : un petit jacquard tricoté (mailles en V sur fond plus sombre), dont le motif et
 * les teintes sont propres au patron.
 */
export function KnitCover({ id, className }: { id: string; className?: string }) {
  const { colors, rows, motif } = jacquard(seedOf(id))
  const size = JACQUARD_SIZE * CELL
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn('block', className)} aria-hidden data-testid="knit-cover" data-motif={motif} preserveAspectRatio="xMidYMid slice">
      <rect width={size} height={size} fill={shade(colors[0], -22)} />
      {rows.map((row, y) =>
        row.map((c, x) => {
          const cx = x * CELL + CELL / 2
          const top = y * CELL - 0.6
          const d = `M${cx - 2} ${top}Q${cx - 2.2} ${top + 3.4} ${cx} ${top + CELL + 0.4}M${cx + 2} ${top}Q${cx + 2.2} ${top + 3.4} ${cx} ${top + CELL + 0.4}`
          return <path key={`${x}-${y}`} d={d} fill="none" stroke={colors[c]} strokeWidth={2.1} strokeLinecap="round" />
        }),
      )}
    </svg>
  )
}

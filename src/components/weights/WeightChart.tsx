import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { buildChart, nearestIndex, spreadLabels, type ChartSeries } from '@/lib/chart'
import { formatFullDate, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { formatKg } from '@/lib/weights'

interface Props {
  series: ChartSeries[]
  from: IsoDate
  to: IsoDate
  height?: number
  /** Clic (ou Entrée) sur une pesée du graphique. */
  onSelect?: (date: IsoDate) => void
}

const LABEL_GAP = 16
/** Distance horizontale max (px) entre le clic et une pesée pour la sélectionner. */
const HIT_RADIUS = 24

/** Courbes de poids (une par personne) avec réticule, info-bulle et étiquettes de fin de courbe. */
export function WeightChart({ series, from, to, height = 260, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const node = container.current
    if (!node) return
    const update = () => node.clientWidth > 0 && setWidth(node.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const chart = useMemo(() => buildChart(series, from, to, width, height), [series, from, to, width, height])
  const { plot } = chart

  const lastPoints = chart.series.map((s) => s.points.at(-1))
  const labelYs = spreadLabels(
    lastPoints.map((p) => p?.y ?? plot.top),
    LABEL_GAP,
    plot.top + 6,
    plot.bottom,
  )

  const activeDate = active === null ? null : chart.dates[active]
  const readout = activeDate
    ? chart.series.map((s) => ({ s, point: s.points.find((p) => p.date === activeDate.date) }))
    : []

  function pointerX(event: { clientX: number; currentTarget: SVGSVGElement }) {
    const rect = event.currentTarget.getBoundingClientRect()
    return rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * width : event.clientX
  }

  function handlePointer(event: PointerEvent<SVGSVGElement>) {
    setActive(nearestIndex(chart.dates, pointerX(event)))
  }

  function handleClick(event: MouseEvent<SVGSVGElement>) {
    const px = pointerX(event)
    const target = chart.dates[nearestIndex(chart.dates, px)]
    if (target && Math.abs(target.x - px) <= HIT_RADIUS) onSelect?.(target.date)
  }

  function handleKey(event: KeyboardEvent<SVGSVGElement>) {
    if (chart.dates.length === 0) return
    const last = chart.dates.length - 1
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (step !== 0) {
      event.preventDefault()
      // Première pression : on démarre sur la pesée la plus récente.
      setActive((i) => (i === null ? last : Math.min(last, Math.max(0, i + step))))
    } else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(last)
    else if (event.key === 'Escape') setActive(null)
    else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
      event.preventDefault()
      onSelect?.(chart.dates[active]!.date)
    }
  }

  const tooltipLeft = activeDate ? Math.min(Math.max(activeDate.x, 80), width - 80) : 0

  return (
    <div ref={container} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Évolution du poids. Flèches gauche et droite pour parcourir les pesées, Entrée pour modifier."
        tabIndex={0}
        className={cn(
          'block touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          onSelect && 'cursor-pointer',
        )}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onClick={handleClick}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        onKeyDown={handleKey}
        onBlur={() => setActive(null)}
      >
        {/* Grille et axes, discrets */}
        {chart.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={plot.left} x2={plot.right} y1={t.y} y2={t.y} className="stroke-border" strokeWidth={1} />
            <text x={plot.left - 8} y={t.y} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {t.value}
            </text>
          </g>
        ))}
        {chart.xTicks.map((t) => (
          <text key={`${t.label}-${t.x}`} x={t.x} y={plot.bottom + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {t.label}
          </text>
        ))}

        {/* Réticule */}
        {activeDate && (
          <line x1={activeDate.x} x2={activeDate.x} y1={plot.top} y2={plot.bottom} className="stroke-foreground/30" strokeWidth={1} />
        )}

        {/* Courbes */}
        {chart.series.map((s) => (
          <g key={s.id} data-testid={`series-${s.id}`}>
            <path d={s.path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p) => (
              <circle
                key={p.date}
                data-date={p.date}
                cx={p.x}
                cy={p.y}
                r={activeDate?.date === p.date ? 5 : 3}
                fill={s.color}
                className="stroke-background"
                strokeWidth={2}
              />
            ))}
          </g>
        ))}

        {/* Étiquettes de fin de courbe : la dernière valeur de chaque personne */}
        {chart.series.map((s, i) => {
          const last = lastPoints[i]
          if (!last) return null
          return (
            <text key={s.id} x={plot.right + 8} y={labelYs[i]} dy="0.32em" className="fill-foreground text-[11px] font-medium tabular-nums">
              <tspan fill={s.color}>●</tspan> {s.label}
            </text>
          )
        })}
      </svg>

      {activeDate && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: tooltipLeft }}
        >
          <p className="mb-1 font-medium">{formatFullDate(activeDate.date)}</p>
          {readout.map(({ s, point }) => (
            <p key={s.id} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="font-semibold tabular-nums">{point ? formatKg(point.value) : '—'}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </p>
          ))}
          {onSelect && <p className="mt-1 text-[11px] text-muted-foreground">Clic pour modifier</p>}
        </div>
      )}
    </div>
  )
}

import { daysBetween, xTicks, yDomain, yTicks, type WeightEntry } from './weights'
import type { IsoDate } from './dates'

export interface ChartSeries {
  id: string
  label: string
  color: string
  entries: WeightEntry[]
}

export interface ChartPoint {
  date: IsoDate
  value: number
  x: number
  y: number
}

export interface ChartGeometry {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  yTicks: { value: number; y: number }[]
  xTicks: { label: string; x: number }[]
  series: (ChartSeries & { points: ChartPoint[]; path: string })[]
  /** Toutes les dates mesurées, triées, avec leur abscisse (pour le réticule). */
  dates: { date: IsoDate; x: number }[]
}

export const CHART_MARGIN = { top: 12, right: 64, bottom: 28, left: 40 }

/** Calcule la géométrie du graphique : échelles, graduations et tracés (les trous sont enjambés). */
export function buildChart(series: ChartSeries[], from: IsoDate, to: IsoDate, width: number, height: number): ChartGeometry {
  const plot = {
    left: CHART_MARGIN.left,
    right: Math.max(CHART_MARGIN.left + 1, width - CHART_MARGIN.right),
    top: CHART_MARGIN.top,
    bottom: Math.max(CHART_MARGIN.top + 1, height - CHART_MARGIN.bottom),
  }
  const span = Math.max(1, daysBetween(from, to))
  const x = (date: IsoDate) => plot.left + (daysBetween(from, date) / span) * (plot.right - plot.left)
  const domain = yDomain(series.flatMap((s) => s.entries.map((e) => e.weight_kg)))
  const y = (value: number) => plot.bottom - ((value - domain[0]) / (domain[1] - domain[0])) * (plot.bottom - plot.top)
  const round = (n: number) => Math.round(n * 10) / 10

  const built = series.map((s) => {
    const points = s.entries.map((e) => ({ date: e.measured_on, value: e.weight_kg, x: round(x(e.measured_on)), y: round(y(e.weight_kg)) }))
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    return { ...s, points, path }
  })

  const dateSet = [...new Set(series.flatMap((s) => s.entries.map((e) => e.measured_on)))].sort()

  return {
    width,
    height,
    plot,
    yTicks: yTicks(domain).map((value) => ({ value, y: round(y(value)) })),
    xTicks: xTicks(from, to, Math.max(2, Math.floor((plot.right - plot.left) / 70))).map((t) => ({ label: t.label, x: round(x(t.date)) })),
    series: built,
    dates: dateSet.map((date) => ({ date, x: round(x(date)) })),
  }
}

/** Index de la date la plus proche d'une abscisse (recherche dichotomique), ou -1 s'il n'y a aucune date. */
export function nearestIndex(dates: readonly { x: number }[], px: number): number {
  if (dates.length === 0) return -1
  let lo = 0
  let hi = dates.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (dates[mid]!.x < px) lo = mid
    else hi = mid
  }
  return Math.abs(dates[lo]!.x - px) <= Math.abs(dates[hi]!.x - px) ? lo : hi
}

/**
 * Décale verticalement les étiquettes de fin de courbe pour qu'elles ne se chevauchent pas
 * (écart minimal `gap`), en restant dans [top, bottom].
 */
export function spreadLabels(ys: readonly number[], gap: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const placed: number[] = []
  for (const item of order) {
    const prev = placed.at(-1)
    placed.push(prev === undefined ? Math.max(top, item.y) : Math.max(item.y, prev + gap))
  }
  // Si on déborde en bas, on remonte le tout.
  const overflow = (placed.at(-1) ?? bottom) - bottom
  const shifted = overflow > 0 ? placed.map((y) => Math.max(top, y - overflow)) : placed
  const result = new Array<number>(ys.length)
  order.forEach((item, k) => (result[item.i] = shifted[k]!))
  return result
}

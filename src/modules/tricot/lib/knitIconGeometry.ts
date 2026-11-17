// Géométrie des icônes illustrées du module Tricot (même famille que l'icône panier) : fil retors le long d'un tracé,
// pelotes, aiguilles en bois. Calculée sans DOM, une fois, en coordonnées 64 × 64.

export type Point = [number, number]

/** Teintes d'un fil : [fond foncé, base, clair, plus clair, bord]. */
export type Palette = readonly [string, string, string, string, string]

export const PALETTES = {
  indigo: ['#2c3878', '#3f4fa0', '#5a69bd', '#7e8bcf', '#1a2150'],
  garance: ['#7a2a1c', '#a33a26', '#c4553a', '#de7a5c', '#4f1a11'],
  gaude: ['#b88a12', '#d6a91f', '#e8c547', '#f2d97a', '#6e520a'],
  sauge: ['#4f6a4b', '#6d8a68', '#8aa685', '#aac2a5', '#2f412c'],
} as const satisfies Record<string, Palette>

/** Bois des aiguilles : [corps, reflet, bord]. */
export const WOOD = ['#c08a52', '#e0b07a', '#8a5a2e'] as const

/** Vert du « + » (ajouter), rouge du « − » (retirer). */
export const PLUS_GREEN = '#4f8a4b'
export const MINUS_RED = '#b4382a'

/** Points d'une courbe de Bézier cubique. */
export function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 24): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const u = 1 - t
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]
  })
}

/** Points d'un segment droit, assez serrés pour que les brins ondulent. */
export function line(a: Point, b: Point): Point[] {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
}

/** Points d'un arc de cercle (angles en degrés, y vers le bas). */
export function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 40): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
}

/** Plusieurs morceaux mis bout à bout (sans répéter le point de jonction). */
export function join(...parts: Point[][]): Point[] {
  return parts.flatMap((p, i) => (i === 0 ? p : p.slice(1)))
}

/** Rééchantillonne une ligne brisée tous les `step` (longueur d'arc), avec la normale en chaque point. */
function resample(points: Point[], step: number): { p: Point; n: Point; s: number }[] {
  const out: { p: Point; n: Point; s: number }[] = []
  let s = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i]!
    const [bx, by] = points[i + 1]!
    const len = Math.hypot(bx - ax, by - ay)
    if (len === 0) continue
    const n: Point = [-(by - ay) / len, (bx - ax) / len]
    for (let d = out.length === 0 ? 0 : step - (s % step); d <= len; d += step) {
      out.push({ p: [ax + ((bx - ax) * d) / len, ay + ((by - ay) * d) / len], n, s: s + d })
    }
    s += len
  }
  const last = points[points.length - 1]!
  if (out.length > 0) out.push({ p: last, n: out[out.length - 1]!.n, s })
  return out
}

interface PlyPiece {
  ply: number
  front: boolean
  points: string
}

/** Fil retors (3 brins) le long d'une ligne : morceaux « devant » et « derrière », pour l'entrelacement. */
export function plyAlong(points: Point[], width: number, plies = 3): PlyPiece[] {
  const period = width * 2.4
  const samples = resample(points, 0.5)
  const pieces: PlyPiece[] = []
  for (let i = 0; i < plies; i++) {
    let current: string[] = []
    let front: boolean | null = null
    for (const { p, n, s } of samples) {
      const phase = (2 * Math.PI * s) / period + (2 * Math.PI * i) / plies
      const off = Math.sin(phase) * width * 0.34
      const isFront = Math.cos(phase) > 0
      const pt = `${(p[0] + n[0] * off).toFixed(2)},${(p[1] + n[1] * off).toFixed(2)}`
      if (front !== isFront) {
        if (front !== null) pieces.push({ ply: i, front, points: current.join(' ') })
        current = current.length ? [current[current.length - 1]!] : []
        front = isFront
      }
      current.push(pt)
    }
    if (front !== null) pieces.push({ ply: i, front, points: current.join(' ') })
  }
  return pieces
}

/** Ligne brisée en attribut `points`. */
export function toPoints(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

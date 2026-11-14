// Jauge « pelote et fil » du module Tricot : la pelote (à gauche) se déroule et rapetisse, le fil retors (3 brins)
// avance vers la droite à chaque rang. Géométrie pure (sans DOM) : testable et identique d'un écran à l'autre.

/** Indigo du module : couleur de la jauge d'un projet sans couleur de laine. */
export const DEFAULT_HUE = '#3f4fa0'

/** Brins du fil. */
export const PLIES = 3

/** Couleurs de la jauge : celles de la laine (1 à 3), sinon l'indigo du module. */
export function gaugeHues(hues: string[]): string[] {
  return hues.length > 0 ? hues : [DEFAULT_HUE]
}

/** « #3f4fa0 » → [teinte 0-360, saturation 0-100, clarté 0-100]. */
export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

/** Même couleur, plus claire (dl > 0) ou plus sombre, bornée pour rester une couleur de fil. */
export function shade(hex: string, dl: number): string {
  const [h, s, l] = hexToHsl(hex)
  return `hsl(${h} ${s}% ${Math.max(6, Math.min(92, Math.round(l + dl)))}%)`
}

/** Graine stable tirée d'un identifiant : chaque projet a sa pelote, toujours enroulée pareil. */
export function seedOf(id: string): number {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (Math.abs(h) % 2147483646) + 1
}

/** Tirage pseudo-aléatoire reproductible (Park-Miller). */
export function random(seed: number): () => number {
  let s = seed % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Un tour de fil sur la pelote : demi-ellipse (face visible) tournée de `rotate` degrés autour du centre de la pelote. */
export interface Wrap {
  d: string
  rotate: number
  width: number
  color: string
  edge: string
}

/**
 * Enroulement irrégulier de la pelote : tours d'angle, de courbure, d'épaisseur et de nuance variés. La rotation est
 * dans le tracé (pas de transform) : la boîte de chaque tour reste dans la pelote, centrée en (cx, cy).
 */
export function ballWraps(seed: number, r: number, hues: string[], count: number, cx = 0, cy = 0): Wrap[] {
  const rand = random(seed)
  const colors = gaugeHues(hues)
  const base = r / 7.5
  return Array.from({ length: count }, () => {
    const rotate = Math.round(rand() * 3600) / 10
    const ry = r * (0.08 + rand() * 0.92)
    const rr = r * (0.96 + rand() * 0.08)
    const side = rand() < 0.5 ? 0 : 1
    const dy = (rand() - 0.5) * r * 0.12
    const width = base * (0.7 + rand() * 0.6)
    const hue = colors[Math.floor(rand() * colors.length)]!
    const color = shade(hue, (rand() - 0.5) * 22)
    const f = (n: number) => n.toFixed(2)
    const t = (rotate * Math.PI) / 180
    const at = (x: number, y: number) => `${f(cx + x * Math.cos(t) - y * Math.sin(t))} ${f(cy + x * Math.sin(t) + y * Math.cos(t))}`
    return { d: `M${at(-rr, dy)}A${f(rr)} ${f(ry)} ${rotate} 0 ${side} ${at(rr, dy)}`, rotate, width: Number(width.toFixed(2)), color, edge: shade(hue, -34) }
  })
}

/** Ligne du fil : de la pelote (x0) jusqu'au bout (x1), en vagues douces autour de y. */
export interface ThreadLine {
  x0: number
  x1: number
  y: number
  amp: number
  waves: number
  /** Épaisseur du fil. */
  width: number
}

export interface PlySegment {
  ply: number
  front: boolean
  points: string
}

function centerAt(line: ThreadLine, x: number): number {
  return line.y + line.amp * Math.sin((line.waves * 2 * Math.PI * (x - line.x0)) / (line.x1 - line.x0))
}

/** Points de la ligne du fil (polyline SVG). */
export function threadCenter(line: ThreadLine, step = 2): string {
  const pts: string[] = []
  for (let x = line.x0; x <= line.x1 + 1e-9; x += step) pts.push(`${x.toFixed(1)},${centerAt(line, x).toFixed(1)}`)
  return pts.join(' ')
}

/**
 * Brins du fil retors : chacun ondule autour de la ligne, décalé d'un tiers de tour ; découpés en morceaux « devant »
 * (dessinés par-dessus, plus clairs) et « derrière », ce qui donne l'entrelacement.
 */
export function plySegments(line: ThreadLine, plies = PLIES, step = 0.8): PlySegment[] {
  const period = line.width * 2.2
  const segments: PlySegment[] = []
  for (let i = 0; i < plies; i++) {
    let current: string[] = []
    let front: boolean | null = null
    let s = 0
    let prev: [number, number] | null = null
    for (let x = line.x0; x <= line.x1 + 1e-9; x += step) {
      const y = centerAt(line, x)
      if (prev) s += Math.hypot(x - prev[0], y - prev[1])
      const slope = (centerAt(line, x + 0.5) - y) / 0.5
      const norm = Math.hypot(1, slope)
      const phase = (2 * Math.PI * s) / period + (2 * Math.PI * i) / plies
      const off = Math.sin(phase) * line.width * 0.36
      const isFront = Math.cos(phase) > 0
      const pt = `${(x - (slope / norm) * off).toFixed(2)},${(y + off / norm).toFixed(2)}`
      if (front !== isFront) {
        if (front !== null) segments.push({ ply: i, front, points: current.join(' ') })
        current = current.length ? [current[current.length - 1]!] : []
        front = isFront
      }
      current.push(pt)
      prev = [x, y]
    }
    if (front !== null) segments.push({ ply: i, front, points: current.join(' ') })
  }
  return segments
}

/** Part tricotée (0 à 1). */
export function gaugeFraction(done: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
}

/** Taille de la pelote : pleine au départ, au moins 45 % à la fin. */
export function ballScale(fraction: number): number {
  return 0.45 + 0.55 * (1 - fraction)
}

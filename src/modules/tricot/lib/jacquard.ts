// Couverture « tissée » d'un patron sans photo : un petit jacquard tricoté (mailles en V), propre à chaque patron.

import { random } from './yarnGauge'

/** Teintes du jacquard (fond écru + deux teintures). */
export const JACQUARD_DYES = ['#3f4fa0', '#b4472f', '#e2b93a', '#6e5238', '#7f9a7a', '#7a3f8f']
export const JACQUARD_BASE = '#ece3d0'

/** Mailles par côté. */
export const JACQUARD_SIZE = 8

type Motif = (x: number, y: number) => 0 | 1 | 2

/** Motifs classiques : chevrons, losanges, rayures, pois, damier. */
export const MOTIFS: Record<string, Motif> = {
  chevrons: (x, y) => ((y + Math.abs((x % 8) - 4)) % 4 < 2 ? 1 : 0),
  losanges: (x, y) => {
    const d = Math.abs((x % 6) - 3) + Math.abs((y % 6) - 3)
    return d === 0 ? 2 : d <= 2 ? 1 : 0
  },
  rayures: (_, y) => (y % 4 === 0 ? 2 : y % 4 === 1 ? 1 : 0),
  pois: (x, y) => ((x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3) ? 1 : 0),
  damier: (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 1 : 0),
}

export interface Jacquard {
  motif: string
  /** Couleurs : [fond, motif, accent]. */
  colors: [string, string, string]
  /** Couleur de chaque maille (index dans colors), rang par rang. */
  rows: (0 | 1 | 2)[][]
}

/** Jacquard d'un patron : motif et teintes tirés de sa graine, toujours les mêmes pour lui. */
export function jacquard(seed: number): Jacquard {
  const rand = random(seed)
  const names = Object.keys(MOTIFS)
  const motif = names[Math.floor(rand() * names.length)]!
  const first = Math.floor(rand() * JACQUARD_DYES.length)
  const second = (first + 1 + Math.floor(rand() * (JACQUARD_DYES.length - 1))) % JACQUARD_DYES.length
  const draw = MOTIFS[motif]!
  const rows = Array.from({ length: JACQUARD_SIZE }, (_, y) => Array.from({ length: JACQUARD_SIZE }, (_, x) => draw(x, y)))
  return { motif, colors: [JACQUARD_BASE, JACQUARD_DYES[first]!, JACQUARD_DYES[second]!], rows }
}

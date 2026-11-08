// Module Tricot : nombres de la taille choisie, mis en valeur dans le texte d'un patron recopié tel quel.
//
// Les patrons donnent les nombres de toutes les tailles à la suite, dans l'ordre des tailles :
//   « monter 60 (64-68-72) m. », « 60 (64, 68, 72) », « 60 [64/68/72] », « 60/64/68/72 », « 60-64-68-72 »,
//   ou en alternance, une taille sur deux entre parenthèses : « 43(43)44(45)46(47)48 ».
// Un groupe n'est reconnu que s'il a exactement autant de nombres que le patron a de tailles : un « 2/3 » ou un
// « 10-12 cm » isolés ne sont pas pris pour des tailles. Les formes sans parenthèses demandent au moins 3 tailles.

export type SizedPart =
  | { kind: 'text'; text: string }
  /** Nombre d'un groupe de tailles : celui de la taille mise en valeur, ou celui d'une autre taille. */
  | { kind: 'size'; text: string; chosen: boolean }

const NUMBER = String.raw`\d+(?:[.,]\d+)?`
/** Séparateurs entre tailles ; une virgule suivie d'une espace (une virgule collée est décimale : « 1,5 »). */
const SEPARATOR = String.raw`\s*(?:[-–/;]|,\s)\s*`
const LIST = String.raw`${NUMBER}(?:${SEPARATOR}${NUMBER})*`
// alt : alternance « 43(43)44(45)46 » (un seul nombre par parenthèse) ;
// first, gap, open, list, close : « 60 (64-68) » ; bare : liste sans parenthèses (« 60/64/68 », « 60-64-68 »).
const ALTERNATING = String.raw`${NUMBER}(?:\s*[(\[]\s*${NUMBER}\s*[)\]](?:[ \t]*${NUMBER})?)+`
const GROUP = new RegExp(
  String.raw`(?<![\d.,])(?<alt>${ALTERNATING})|(?<![\d.,])(?<first>${NUMBER})(?<gap>\s*)(?<open>[(\[])\s*(?<list>${LIST})\s*(?<close>[)\]])|(?<![\d.,/-])(?<bare>${NUMBER}(?:\s*[/–-]\s*${NUMBER})+)(?![\d/–-])`,
  'g',
)

/** Nombres d'une liste, avec ce qui les sépare (gardé tel quel à l'affichage). */
function splitList(list: string): string[] {
  return list.split(new RegExp(`(${SEPARATOR})`))
}

/**
 * Découpe `text` en morceaux : texte simple, et nombres des groupes de tailles (`sizeCount` tailles), celui de la
 * taille `index` (0 = première) marqué `chosen`. Sans tailles connues, tout reste du texte simple.
 */
export function sizedParts(text: string, sizeCount: number, index: number | null): SizedPart[] {
  if (sizeCount < 2 || index === null || index < 0 || index >= sizeCount) return text ? [{ kind: 'text', text }] : []
  const parts: SizedPart[] = []
  const pushText = (t: string) => {
    if (!t) return
    const last = parts[parts.length - 1]
    if (last?.kind === 'text') last.text += t
    else parts.push({ kind: 'text', text: t })
  }
  // Nombres (positions paires) et séparateurs (positions impaires) dans l'ordre ; numéro de taille de chaque nombre.
  const pushSizes = (pieces: string[], first: number) => {
    pieces.forEach((piece, i) => {
      if (i % 2 === 1) pushText(piece)
      else parts.push({ kind: 'size', text: piece, chosen: first + i / 2 === index })
    })
  }
  let cursor = 0
  for (const match of text.matchAll(GROUP)) {
    const whole = match[0]
    const { alt, first, gap, open, list, close, bare } = match.groups!
    if (alt !== undefined) {
      // Nombres et ce qui les sépare ; un nombre de trop à la fin (« 43(45) 2 fois ») reste du texte.
      const pieces = alt.split(new RegExp(`(${NUMBER})`)).slice(1)
      if (pieces.length / 2 < sizeCount) continue
      const kept = pieces.slice(0, sizeCount * 2 - 1)
      const rest = pieces.slice(sizeCount * 2 - 1).join('')
      // Après la dernière taille : sa parenthèse fermante, et au plus un nombre isolé ; une parenthèse de plus,
      // c'est une taille de trop.
      if (!/^(\s*[)\]])?[ \t]*(\d+(?:[.,]\d+)?)?$/.test(rest)) continue
      pushText(text.slice(cursor, match.index))
      kept.forEach((piece, i) => (i % 2 === 1 ? pushText(piece) : parts.push({ kind: 'size', text: piece, chosen: i / 2 === index })))
      // Parenthèse fermante de la dernière taille : gardée avec le groupe.
      const closing = /^\s*[)\]]/.exec(rest)?.[0] ?? ''
      pushText(closing)
      cursor = match.index + whole.length - (rest.length - closing.length)
      continue
    }
    if (list !== undefined) {
      const inner = splitList(list)
      if ((inner.length + 1) / 2 + 1 !== sizeCount) continue
      pushText(text.slice(cursor, match.index))
      parts.push({ kind: 'size', text: first!, chosen: index === 0 })
      // Espaces autour de la liste, gardés tels quels.
      const inside = whole.slice(whole.indexOf(open!) + 1, whole.lastIndexOf(close!))
      const lead = inside.slice(0, inside.indexOf(list))
      const trail = inside.slice(inside.indexOf(list) + list.length)
      pushText(gap! + open! + lead)
      pushSizes(inner, 1)
      pushText(trail + close!)
    } else if (bare !== undefined) {
      const pieces = bare.split(/(\s*[/–-]\s*)/)
      if (sizeCount < 3 || (pieces.length + 1) / 2 !== sizeCount) continue
      pushText(text.slice(cursor, match.index))
      pushSizes(pieces, 0)
    }
    cursor = match.index + whole.length
  }
  pushText(text.slice(cursor))
  return parts
}

/** Position de la taille choisie dans les tailles du patron (« m » = « M »), ou null. */
export function sizeIndexOf(sizes: string[], size: string): number | null {
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const index = sizes.findIndex((s) => key(s) === key(size))
  return index === -1 ? null : index
}

/**
 * Corrections du surlignage d'une étape, faites à la main : pour chaque taille mise en valeur (« 2 », ou « none »
 * sans taille), les nombres corrigés, repérés par leur position dans le texte → surligné ou non.
 */
export type Highlights = Record<string, Record<string, boolean>>

export interface HighlightPart {
  text: string
  /** Position dans le texte (nombres seulement). */
  start: number
  kind: 'text' | 'number'
  /** chosen : surligné ; other : nombre d'une autre taille (estompé) ; plain : rien de particulier. */
  state: 'chosen' | 'other' | 'plain'
}

// Un chiffre collé derrière une lettre fait partie d'un mot (« k2tog », « C4F ») : ce n'est pas un nombre à surligner.
const ANY_NUMBER = new RegExp(String.raw`(?<!\p{L})(${NUMBER})`, 'u')

/** Clé des corrections pour la taille mise en valeur. */
export const highlightKey = (sizeIndex: number | null): string => (sizeIndex === null ? 'none' : String(sizeIndex))

/** Texte découpé pour l'affichage : nombres des tailles reconnus, puis corrections faites à la main. */
export function highlightParts(text: string, sizeCount: number, sizeIndex: number | null, highlights: Highlights = {}): HighlightPart[] {
  const fixes = highlights[highlightKey(sizeIndex)] ?? {}
  const out: HighlightPart[] = []
  let start = 0
  for (const part of sizedParts(text, sizeCount, sizeIndex)) {
    // Texte simple : ses nombres restent corrigeables un par un.
    const pieces = part.kind === 'text' ? part.text.split(ANY_NUMBER) : [part.text]
    pieces.forEach((piece, i) => {
      if (!piece) return
      const isNumber = part.kind === 'size' || i % 2 === 1
      const found: HighlightPart['state'] = part.kind === 'size' ? (part.chosen ? 'chosen' : 'other') : 'plain'
      const fix = isNumber ? fixes[String(start)] : undefined
      const state = fix === undefined ? found : fix ? 'chosen' : found === 'chosen' ? 'plain' : found
      out.push({ text: piece, start, kind: isNumber ? 'number' : 'text', state })
      start += piece.length
    })
  }
  return out
}

/** Corrections après un toucher sur le nombre `part` : surligné ↔ non ; une correction qui revient au calcul est retirée. */
export function toggleHighlight(highlights: Highlights, sizeIndex: number | null, part: HighlightPart, found: HighlightPart['state']): Highlights {
  const key = highlightKey(sizeIndex)
  const fixes = { ...(highlights[key] ?? {}) }
  const next = part.state !== 'chosen'
  if (next === (found === 'chosen')) delete fixes[String(part.start)]
  else fixes[String(part.start)] = next
  const result = { ...highlights, [key]: fixes }
  if (Object.keys(fixes).length === 0) delete result[key]
  return result
}

/** Corrections lues en base : seules celles bien formées sont gardées. */
export function sanitizeHighlights(raw: unknown): Highlights {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: Highlights = {}
  for (const [key, fixes] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(none|\d{1,2})$/.test(key) || typeof fixes !== 'object' || fixes === null || Array.isArray(fixes)) continue
    const kept = Object.fromEntries(Object.entries(fixes as Record<string, unknown>).filter(([pos, v]) => /^\d{1,5}$/.test(pos) && typeof v === 'boolean')) as Record<string, boolean>
    if (Object.keys(kept).length) out[key] = kept
  }
  return out
}

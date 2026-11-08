// Module Tricot : abréviations des patrons, expliquées dans le texte des étapes.
//
// Les abréviations lues dans la légende du patron passent en premier ; le glossaire de base (en base, français et
// anglais) couvre les plus courantes quand le patron n'en a pas. La recherche respecte la casse : « M » (une taille) n'est pas
// « m. » (maille).

/** Abréviation et sa signification. */
export interface Abbreviation {
  abbr: string
  meaning: string
}

/** Glossaire de base (table knit_glossary) : abréviations classiques des patrons français, et des patrons anglais. */
export interface BaseGlossary {
  fr: Abbreviation[]
  en: Abbreviation[]
}

export const EMPTY_GLOSSARY: BaseGlossary = { fr: [], en: [] }

export type TextPart = { kind: 'text'; text: string } | { kind: 'abbr'; text: string; meaning: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Glossaire du patron d'abord, puis le glossaire de base dans la langue du texte (« end. » n'est « endroit » qu'en
 * français : « knit to end. ») ; une abréviation n'apparaît qu'une fois.
 */
export function mergeGlossary(pattern: Abbreviation[], base: BaseGlossary, english = false): Abbreviation[] {
  const seen = new Set(pattern.map((a) => a.abbr))
  return [...pattern, ...(english ? base.en : base.fr).filter((a) => !seen.has(a.abbr))]
}

/**
 * Découpe un texte en morceaux : texte simple, et abréviations du glossaire avec leur sens. Les plus longues passent
 * d'abord (« 2 m. ens. » avant « m. »), entre deux limites de mot.
 */
export function abbreviationParts(text: string, glossary: Abbreviation[]): TextPart[] {
  const terms = glossary.filter((a) => a.abbr.trim()).sort((a, b) => b.abbr.length - a.abbr.length)
  if (!text || terms.length === 0) return text ? [{ kind: 'text', text }] : []
  const meanings = new Map(terms.map((a) => [a.abbr, a.meaning]))
  // Limite de mot : ni lettre ni chiffre juste avant ; après, ni lettre ni chiffre (le point final fait partie du terme).
  const pattern = new RegExp(`(?<![\\p{L}\\d])(${terms.map((a) => escape(a.abbr)).join('|')})(?![\\p{L}\\d])`, 'gu')
  const parts: TextPart[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, match.index) })
    parts.push({ kind: 'abbr', text: match[0], meaning: meanings.get(match[0]) ?? '' })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) })
  return parts
}

/** Texte de patron en anglais (pour proposer la traduction) : plusieurs mots du tricot anglais. */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/\b(knit|purl|rows?|rounds?|rnds?|sts|stitch(es)?|repeat|cast on|bind off|k2tog|ssk|until|work|next|each|end)\b/g)
  return (words?.length ?? 0) >= 3
}

/** Abréviations du patron lues en base : seules celles bien formées sont gardées. */
export function sanitizeAbbreviations(raw: unknown): Abbreviation[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v): Abbreviation[] => {
    if (typeof v !== 'object' || v === null) return []
    const a = v as Record<string, unknown>
    return typeof a.abbr === 'string' && a.abbr.trim() && typeof a.meaning === 'string' && a.meaning.trim()
      ? [{ abbr: a.abbr.slice(0, 40), meaning: a.meaning.slice(0, 300) }]
      : []
  })
}

/** Glossaire de base lu en base (ou gardé sur le téléphone) : seules les abréviations bien formées sont gardées. */
export function sanitizeBaseGlossary(raw: unknown): BaseGlossary {
  if (typeof raw !== 'object' || raw === null) return EMPTY_GLOSSARY
  const g = raw as Record<string, unknown>
  return { fr: sanitizeAbbreviations(g.fr), en: sanitizeAbbreviations(g.en) }
}

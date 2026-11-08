// Module Tricot : abréviations des patrons, expliquées dans le texte des étapes.
//
// Les abréviations lues dans la légende du patron passent en premier ; un glossaire de base (français et anglais)
// couvre les plus courantes quand le patron n'en a pas. La recherche respecte la casse : « M » (une taille) n'est pas
// « m. » (maille).

/** Abréviation et sa signification. */
export interface Abbreviation {
  abbr: string
  meaning: string
}

/** Glossaire de base : abréviations courantes en français, puis en anglais (à partir de « k »). */
export const BASE_GLOSSARY: Abbreviation[] = [
  // Français
  { abbr: 'm.', meaning: 'Maille(s).' },
  { abbr: 'm. end.', meaning: 'Maille(s) endroit.' },
  { abbr: 'm. env.', meaning: 'Maille(s) envers.' },
  { abbr: 'end.', meaning: 'Endroit : maille endroit, ou côté endroit du travail.' },
  { abbr: 'env.', meaning: 'Envers : maille envers, ou côté envers du travail.' },
  { abbr: 'rg', meaning: 'Rang.' },
  { abbr: 'rgs', meaning: 'Rangs.' },
  { abbr: 'tr.', meaning: 'Tour (tricot en rond).' },
  { abbr: 'dim.', meaning: 'Diminution(s) : une maille de moins.' },
  { abbr: 'aug.', meaning: 'Augmentation(s) : une maille de plus.' },
  { abbr: 'gl.', meaning: 'Glisser : passer la maille sur l’aiguille droite sans la tricoter.' },
  { abbr: 'ens.', meaning: 'Ensemble : tricoter les mailles ensemble (une diminution).' },
  { abbr: '2 m. ens.', meaning: 'Tricoter 2 mailles ensemble à l’endroit : une diminution inclinée vers la droite.' },
  { abbr: '2 m. ens. env.', meaning: 'Tricoter 2 mailles ensemble à l’envers : une diminution.' },
  { abbr: 'surjet simple', meaning: 'Glisser 1 m., tricoter 1 m. endroit, rabattre la maille glissée dessus : une diminution inclinée vers la gauche.' },
  { abbr: 'surjet double', meaning: 'Glisser 1 m., tricoter 2 m. ensemble, rabattre la maille glissée dessus : deux mailles en moins.' },
  { abbr: 'jeté', meaning: 'Passer le fil sur l’aiguille droite : une maille de plus, avec un petit trou (dentelle).' },
  { abbr: 'torse', meaning: 'Tricoter la maille par le brin arrière, ce qui la vrille.' },
  { abbr: 'rab.', meaning: 'Rabattre : arrêter les mailles.' },
  { abbr: 'mon.', meaning: 'Monter les mailles.' },
  // Anglais
  { abbr: 'k', meaning: 'Knit : maille endroit.' },
  { abbr: 'p', meaning: 'Purl : maille envers.' },
  { abbr: 'st', meaning: 'Stitch : maille.' },
  { abbr: 'sts', meaning: 'Stitches : mailles.' },
  { abbr: 'k2tog', meaning: 'Knit 2 together : 2 mailles ensemble à l’endroit, diminution inclinée vers la droite.' },
  { abbr: 'p2tog', meaning: 'Purl 2 together : 2 mailles ensemble à l’envers.' },
  { abbr: 'ssk', meaning: 'Slip slip knit : glisser 2 mailles une à une comme à l’endroit, puis les tricoter ensemble par le brin arrière : diminution inclinée vers la gauche.' },
  { abbr: 'skp', meaning: 'Slip, knit, pass : surjet simple (diminution inclinée vers la gauche).' },
  { abbr: 'sk2p', meaning: 'Surjet double : deux mailles en moins.' },
  { abbr: 'yo', meaning: 'Yarn over : jeté (une maille de plus, avec un trou).' },
  { abbr: 'm1', meaning: 'Make 1 : augmentation intercalaire (relever le fil entre deux mailles et le tricoter torse).' },
  { abbr: 'm1l', meaning: 'Make 1 left : augmentation intercalaire inclinée vers la gauche.' },
  { abbr: 'm1r', meaning: 'Make 1 right : augmentation intercalaire inclinée vers la droite.' },
  { abbr: 'kfb', meaning: 'Knit front and back : tricoter la maille par le brin avant puis arrière (une augmentation).' },
  { abbr: 'sl', meaning: 'Slip : glisser la maille sans la tricoter.' },
  { abbr: 'psso', meaning: 'Pass slipped stitch over : rabattre la maille glissée par-dessus.' },
  { abbr: 'tbl', meaning: 'Through back loop : par le brin arrière (maille torse).' },
  { abbr: 'pm', meaning: 'Place marker : placer un marqueur.' },
  { abbr: 'sm', meaning: 'Slip marker : passer le marqueur.' },
  { abbr: 'RS', meaning: 'Right side : endroit du travail.' },
  { abbr: 'WS', meaning: 'Wrong side : envers du travail.' },
  { abbr: 'CO', meaning: 'Cast on : monter les mailles.' },
  { abbr: 'BO', meaning: 'Bind off : rabattre les mailles.' },
  { abbr: 'rep', meaning: 'Repeat : répéter.' },
  { abbr: 'rnd', meaning: 'Round : tour (tricot en rond).' },
  { abbr: 'rnds', meaning: 'Rounds : tours.' },
  { abbr: 'w&t', meaning: 'Wrap and turn : envelopper la maille et tourner (rangs raccourcis).' },
  { abbr: 'St st', meaning: 'Stockinette stitch : jersey.' },
]

export type TextPart = { kind: 'text'; text: string } | { kind: 'abbr'; text: string; meaning: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const ENGLISH_FROM = BASE_GLOSSARY.findIndex((a) => a.abbr === 'k')
/** Glossaire de base dans la langue du texte : « end. » n'est « endroit » qu'en français (« knit to end. »). */
export const baseGlossary = (english: boolean): Abbreviation[] => (english ? BASE_GLOSSARY.slice(ENGLISH_FROM) : BASE_GLOSSARY.slice(0, ENGLISH_FROM))

/** Glossaire du patron d'abord, puis le glossaire de base de la langue du texte (une abréviation n'apparaît qu'une fois). */
export function mergeGlossary(pattern: Abbreviation[], english = false): Abbreviation[] {
  const seen = new Set(pattern.map((a) => a.abbr))
  return [...pattern, ...baseGlossary(english).filter((a) => !seen.has(a.abbr))]
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

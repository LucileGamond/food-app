// Module Tricot : mesures du patron (« 5 cm », « tous les 5 cm ») converties en rangs avec l'échantillon.
//
// Une section dont le patron donne une mesure au lieu d'un nombre de rangs est convertie automatiquement :
// rangs = cm × rangs de l'échantillon pour 10 cm ÷ 10, arrondi. L'échantillon de la tricoteuse sert en priorité,
// sinon celui du patron. Le résultat est marqué « à vérifier » (`measured`) : il suit l'échantillon tant qu'il n'est
// pas validé ; validé (ou réglé à la main), il devient un nombre de rangs comme un autre.

import type { MeasuredRows, StepSection } from './pattern'
import type { Gauge } from './yarn'

const CM_PER_INCH = 2.54

/** « 5 cm », « tous les 2,5 cm », « 50 mm », « 2" », « 2 in » → centimètres ; null si ce n'est pas une longueur. */
export function parseMeasure(text: string | null): number | null {
  if (!text) return null
  const match = /(\d+(?:[.,]\d+)?)\s*(cm|mm|in(?:ch(?:es)?)?\b|pouces?\b|"|″)/i.exec(text)
  if (!match) return null
  const value = Number(match[1]!.replace(',', '.'))
  const unit = match[2]!.toLowerCase()
  const cm = unit === 'cm' ? value : unit === 'mm' ? value / 10 : value * CM_PER_INCH
  return cm > 0 && cm <= 500 ? cm : null
}

/** Rangs pour 10 cm : ceux de la tricoteuse, sinon ceux du patron ; null si aucun. */
export function rowGauge(gauges: { mine: Gauge; pattern: Gauge }): MeasuredRows | null {
  if (gauges.mine.rows) return { rowsPer10: gauges.mine.rows, source: 'mine' }
  if (gauges.pattern.rows) return { rowsPer10: gauges.pattern.rows, source: 'pattern' }
  return null
}

/** Rangs pour `cm` centimètres, arrondis (au moins 1). */
export const rowsFor = (cm: number, rowsPer10: number): number => Math.max(1, Math.round((cm * rowsPer10) / 10))

/** Nombre de rangs de la section : le nombre de rangs, ou le rythme d'une répétition. */
const rowsOf = (section: StepSection) => (section.kind === 'rows' ? section.rows : section.every)

/** Longueur d'une section (« 5 cm » → rangs) convertie si elle est à régler ou pas encore validée. */
function convertLength(section: StepSection, gauge: MeasuredRows): StepSection {
  const cm = parseMeasure(section.pattern)
  if (cm === null || (rowsOf(section) !== null && !section.measured)) return section
  const rows = rowsFor(cm, gauge.rowsPer10)
  return section.kind === 'rows' ? { ...section, rows, measured: gauge } : { ...section, every: rows, measured: gauge }
}

/** Début « en même temps » (« à 15 cm » → rang 46) converti s'il est à régler ou pas encore validé. */
function convertStart(section: StepSection, gauge: MeasuredRows): StepSection {
  const at = section.at
  const cm = parseMeasure(at?.pattern ?? null)
  if (!at || cm === null || (at.row !== null && !at.measured)) return section
  // « À 15 cm » : 15 cm tricotés, la section commence au rang d'après.
  return { ...section, at: { ...at, row: rowsFor(cm, gauge.rowsPer10) + 1, measured: gauge } }
}

/**
 * Section à mesure (« 5 cm », « en même temps, à 15 cm ») convertie en rangs avec l'échantillon, si elle est à
 * régler ou pas encore validée. Sans échantillon, ou section réglée et validée : inchangée.
 */
export function convertSection(section: StepSection, gauge: MeasuredRows | null): StepSection {
  return gauge === null ? section : convertStart(convertLength(section, gauge), gauge)
}

export function convertSections(sections: StepSection[], gauge: MeasuredRows | null): StepSection[] {
  return sections.map((s) => convertSection(s, gauge))
}

/** Calcul validé : la section devient un nombre de rangs (et un rang de début) comme un autre. */
export function validateSection(section: StepSection): StepSection {
  const { measured: _measured, ...rest } = section
  if (!rest.at?.measured) return rest
  const { measured: _atMeasured, ...at } = rest.at
  return { ...rest, at }
}

const number = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** « 5 cm », « 2,5 cm » */
export const formatCm = (cm: number): string => `${number(cm)} cm`

const sourceOf = (gauge: MeasuredRows) => (gauge.source === 'mine' ? 'ton échantillon' : 'échantillon du patron')

/**
 * « 5 cm × 30 rangs pour 10 cm (ton échantillon) ≈ 15 rangs » ; « début : 15 cm × 30 rangs pour 10 cm (…) ≈ rang 46 » ;
 * null si la section n'est pas convertie.
 */
export function describeConversion(section: StepSection): string | null {
  const parts: string[] = []
  const cm = parseMeasure(section.pattern)
  const rows = rowsOf(section)
  if (section.measured && cm !== null && rows !== null) {
    parts.push(`${formatCm(cm)} × ${number(section.measured.rowsPer10)} rangs pour 10 cm (${sourceOf(section.measured)}) ≈ ${rows} rang${rows > 1 ? 's' : ''}`)
  }
  const at = section.at
  const atCm = parseMeasure(at?.pattern ?? null)
  if (at?.measured && atCm !== null && at.row !== null) {
    parts.push(`début : ${formatCm(atCm)} × ${number(at.measured.rowsPer10)} rangs pour 10 cm (${sourceOf(at.measured)}) ≈ rang ${at.row}`)
  }
  return parts.length ? parts.join(' ; ') : null
}

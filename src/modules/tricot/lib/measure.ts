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

/**
 * Section à mesure (« 5 cm ») convertie en rangs avec l'échantillon, si elle est à régler ou pas encore validée.
 * Sans échantillon, ou section réglée et validée : inchangée.
 */
export function convertSection(section: StepSection, gauge: MeasuredRows | null): StepSection {
  const cm = parseMeasure(section.pattern)
  if (cm === null || gauge === null || (rowsOf(section) !== null && !section.measured)) return section
  const rows = rowsFor(cm, gauge.rowsPer10)
  return section.kind === 'rows' ? { ...section, rows, measured: gauge } : { ...section, every: rows, measured: gauge }
}

export function convertSections(sections: StepSection[], gauge: MeasuredRows | null): StepSection[] {
  return sections.map((s) => convertSection(s, gauge))
}

/** Calcul validé : la section devient un nombre de rangs comme un autre. */
export function validateSection(section: StepSection): StepSection {
  const { measured: _measured, ...rest } = section
  return rest
}

const number = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** « 5 cm », « 2,5 cm » */
export const formatCm = (cm: number): string => `${number(cm)} cm`

/** « 5 cm × 30 rangs pour 10 cm (ton échantillon) ≈ 15 rangs » ; null si la section n'est pas convertie. */
export function describeConversion(section: StepSection): string | null {
  const cm = parseMeasure(section.pattern)
  const rows = rowsOf(section)
  if (!section.measured || cm === null || rows === null) return null
  const source = section.measured.source === 'mine' ? 'ton échantillon' : 'échantillon du patron'
  return `${formatCm(cm)} × ${number(section.measured.rowsPer10)} rangs pour 10 cm (${source}) ≈ ${rows} rang${rows > 1 ? 's' : ''}`
}

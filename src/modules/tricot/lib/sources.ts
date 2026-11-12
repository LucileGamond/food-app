// Module Tricot : le texte du patron porté par les sous-étapes.
//
// Chaque sous-étape garde son extrait du texte (source) ; le texte de l'étape est leur réunion. Une étape d'avant
// (texte sur l'étape seulement) le confie à sa première sous-étape avant d'être réorganisée : rien ne se perd.

import { MAX_INSTRUCTIONS, type KnitStep, type StepSection } from './pattern'

type TextStep = Pick<KnitStep, 'title' | 'totalRows' | 'sections' | 'instructions'>

/** Sous-étapes d'une étape, le texte de l'étape confié à la première si aucune n'en porte (une créée s'il n'y en a pas). */
export function anchoredSections(step: TextStep): StepSection[] {
  const sections: StepSection[] = step.sections.length ? step.sections : [{ kind: 'rows', rows: step.totalRows, every: null, times: null, text: step.title, pattern: null }]
  if (!step.instructions.trim() || sections.some((s) => s.source)) return sections
  return sections.map((s, i) => (i === 0 ? { ...s, source: step.instructions } : s))
}

/** Texte d'une étape d'après ses sous-étapes. */
export function textOf(sections: StepSection[]): string {
  return sections
    .map((s) => s.source?.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_INSTRUCTIONS)
}

/** Sous-étape supprimée : son texte du patron passe à la précédente (à la suivante pour la première), rien ne se perd. */
export function withoutSection(sections: StepSection[], index: number): StepSection[] {
  const source = sections[index]?.source
  const rest = sections.filter((_, i) => i !== index)
  if (!source || !rest.length) return rest
  const heir = index > 0 ? index - 1 : 0
  const joined = (heirSource: string | undefined) => (index > 0 ? [heirSource, source] : [source, heirSource]).filter(Boolean).join('\n\n')
  return rest.map((s, i) => (i === heir ? { ...s, source: joined(s.source) } : s))
}

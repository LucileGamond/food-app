// Module Tricot : les aiguilles du patron et celle de chaque sous-étape.
//
// Le projet liste ses aiguilles (en mm). Chaque sous-étape a la sienne, héritée de la précédente quand elle n'en dit
// rien ; avec une seule aiguille au projet, elle vaut partout.

import type { StepSection } from './pattern'

export const MAX_NEEDLES = 10

const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 30

/** Aiguilles lues en base ou saisies : bornées, sans doublon, de la plus fine à la plus grosse. */
export function sanitizeNeedles(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter(valid).map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b).slice(0, MAX_NEEDLES)
}

/** « 3,5 mm ». */
export const formatNeedle = (mm: number) => `${mm.toLocaleString('fr-FR')} mm`

/** « 3,5 » ou « 3.5 mm » → 3.5 (null : saisie illisible). Une taille libre : pas forcément celle du patron. */
export function parseNeedle(text: string): number | null {
  const trimmed = text.replace(/mm$/i, '').trim().replace(',', '.')
  if (!trimmed) return null
  const value = Number(trimmed)
  return valid(value) ? Math.round(value * 100) / 100 : null
}

/** « 3 ; 3,5 » ou « 3 3.5 » → [3, 3.5] (null : saisie illisible). */
export function parseNeedles(text: string): number[] | null {
  const parts = text.split(/\s*;\s*|\s+|,\s+/).map((p) => p.replace(/mm$/i, '').trim()).filter(Boolean)
  const values = parts.map((p) => Number(p.replace(',', '.')))
  if (values.some((v) => !valid(v))) return null
  return sanitizeNeedles(values)
}

/**
 * Aiguille de chaque sous-étape : la sienne, sinon celle d'avant ; pour la première, celle où finit l'étape d'avant
 * (`from`), sinon la seule du projet s'il n'y en a qu'une.
 */
export function effectiveNeedles(sections: Pick<StepSection, 'needle'>[], projectNeedles: number[], from: number | null = null): (number | null)[] {
  let current: number | null = from ?? (projectNeedles.length === 1 ? projectNeedles[0]! : null)
  return sections.map((s) => {
    if (s.needle !== undefined && valid(s.needle)) current = s.needle
    return current
  })
}

/** Aiguilles lues en base sur une sous-étape (null : héritée). */
export const readNeedle = (value: unknown): number | null => (valid(value) ? Math.round(value * 100) / 100 : null)

/** Aiguille héritée par chaque étape : celle où finit l'étape d'avant (null pour la première, ou sans aiguille). */
export function chainNeedles(steps: Pick<StepSection, 'needle'>[][], projectNeedles: number[]): (number | null)[] {
  const from: (number | null)[] = []
  let current: number | null = null
  for (const sections of steps) {
    from.push(current)
    current = effectiveNeedles(sections, projectNeedles, current).at(-1) ?? current
  }
  return from
}

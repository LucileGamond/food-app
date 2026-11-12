// Module Tricot hors ligne : dernière version de chaque projet gardée sur le téléphone, et avancée (rangs, notes…)
// mise en attente sans réseau, envoyée au retour du réseau. Rien de bloquant : un stockage indisponible (navigation
// privée, quota) fait seulement perdre le confort hors ligne.

import type { StepProgress } from '../api'
import type { KnitProject } from './pattern'

const PROJECT_KEY = (id: string) => `life:tricot:projet:${id}`
const PENDING_KEY = 'life:tricot:en-attente'

/** Avancée en attente, par étape : ce qu'il reste à envoyer (les derniers changements l'emportent). */
export type PendingProgress = Record<string, { projectId: string; progress: StepProgress }>

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Stockage plein ou interdit : pas de copie hors ligne.
  }
}

export function saveProjectCopy(project: KnitProject): void {
  write(PROJECT_KEY(project.id), project)
}

export function loadProjectCopy(id: string): KnitProject | null {
  const project = read<KnitProject>(PROJECT_KEY(id))
  if (!project || project.id !== id || !Array.isArray(project.steps)) return null
  // Copie gardée avant les étapes tricotées plusieurs fois : une seule fois.
  return { ...project, steps: project.steps.map((s) => ({ ...s, times: s.times ?? 1, pass: s.pass ?? 1 })) }
}

export function forgetProjectCopy(id: string): void {
  write(PROJECT_KEY(id), null)
}

/** Projet supprimé : sa copie et son avancée en attente sont oubliées. */
export function forgetProject(id: string): void {
  forgetProjectCopy(id)
  const pending = pendingProgress()
  for (const [stepId, p] of Object.entries(pending)) if (p.projectId === id) delete pending[stepId]
  write(PENDING_KEY, Object.keys(pending).length ? pending : null)
}

export function pendingProgress(): PendingProgress {
  return read<PendingProgress>(PENDING_KEY) ?? {}
}

/** Met une avancée en attente (fusionnée avec celle déjà en attente pour l'étape). */
export function queueProgress(projectId: string, stepId: string, progress: StepProgress): void {
  const pending = pendingProgress()
  pending[stepId] = { projectId, progress: { ...pending[stepId]?.progress, ...progress } }
  write(PENDING_KEY, pending)
}

/** Retire une avancée envoyée, sauf si elle a changé depuis (un nouveau rang compté pendant l'envoi). */
export function clearProgress(stepId: string, sent: StepProgress): void {
  const pending = pendingProgress()
  if (JSON.stringify(pending[stepId]?.progress) !== JSON.stringify(sent)) return
  delete pending[stepId]
  write(PENDING_KEY, Object.keys(pending).length ? pending : null)
}

/**
 * Une avancée enregistrée en ligne remplace ce qui attendait pour les mêmes champs (une valeur comptée hors ligne,
 * plus ancienne, ne doit pas être renvoyée ensuite). `queuedAtSend` : l'attente de l'étape au moment de l'envoi ;
 * un champ remis en attente pendant l'envoi est gardé.
 */
export function settleProgress(stepId: string, sent: StepProgress, queuedAtSend: StepProgress | undefined): void {
  const pending = pendingProgress()
  const entry = pending[stepId]
  if (!entry) return
  const rest: Record<string, unknown> = { ...entry.progress }
  for (const key of Object.keys(sent)) {
    if (JSON.stringify(rest[key]) === JSON.stringify(queuedAtSend?.[key as keyof StepProgress])) delete rest[key]
  }
  if (Object.keys(rest).length) pending[stepId] = { ...entry, progress: rest as StepProgress }
  else delete pending[stepId]
  write(PENDING_KEY, Object.keys(pending).length ? pending : null)
}

/** Avancées en attente d'un projet. */
export function pendingFor(projectId: string): [string, StepProgress][] {
  return Object.entries(pendingProgress())
    .filter(([, p]) => p.projectId === projectId)
    .map(([stepId, p]) => [stepId, p.progress])
}

/** Projet avec ses avancées en attente appliquées (ce qui a été compté hors ligne reste affiché). */
export function withPending(project: KnitProject): KnitProject {
  const pending = new Map(pendingFor(project.id))
  if (pending.size === 0) return project
  return { ...project, steps: project.steps.map((s) => (pending.has(s.id) ? { ...s, ...pending.get(s.id) } : s)) }
}

/** Sans réseau d'après le navigateur. */
export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false

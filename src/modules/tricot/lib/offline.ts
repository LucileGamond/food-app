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
  return project && project.id === id && Array.isArray(project.steps) ? project : null
}

export function forgetProjectCopy(id: string): void {
  write(PROJECT_KEY(id), null)
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

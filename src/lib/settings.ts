// Réglages de chacun : pages affichées, notifications reçues, objectif et contenants d'hydratation.

import { DEFAULT_CONTAINERS, type WaterContainer } from './hydration'

export type PageKey = 'planning' | 'recettes' | 'plan' | 'courses' | 'poids' | 'hydratation' | 'tricot' | 'plantes'
export type NotificationTopic = 'courses' | 'hydratation' | 'plantes'

export interface PageInfo {
  key: PageKey
  to: string
  /** Nom court (onglets). */
  label: string
  /** Ce que contient la page (réglages). */
  description: string
}

/** Pages, dans l'ordre de leurs sections. */
export const PAGES: PageInfo[] = [
  { key: 'planning', to: '/planning', label: 'Planning', description: 'Repas de la semaine et idées à planifier' },
  { key: 'recettes', to: '/recettes', label: 'Recettes', description: 'Recettes enregistrées et mode cuisine' },
  { key: 'courses', to: '/courses', label: 'Courses', description: 'Listes de courses partagées' },
  { key: 'poids', to: '/poids', label: 'Poids', description: 'Suivi du poids' },
  { key: 'plan', to: '/plan', label: 'Plan', description: 'Suivi alimentaire' },
  { key: 'hydratation', to: '/hydratation', label: 'Eau', description: 'Suivi d’hydratation' },
  { key: 'tricot', to: '/tricot', label: 'Tricot', description: 'Patrons découpés en étapes, compteur de rangs' },
  { key: 'plantes', to: '/plantes', label: 'Plantes', description: 'Plantes de la maison et arrosages, partagés' },
]

export const NOTIFICATION_TOPICS: { key: NotificationTopic; label: string; description: string; summary: string }[] = [
  { key: 'courses', label: 'Courses', description: 'Quand l’autre modifie une liste de courses', summary: 'listes de courses modifiées par l’autre' },
  { key: 'hydratation', label: 'Eau', description: 'Rappel après 4 h sans boire (9 h – 23 h), jusqu’à l’objectif', summary: 'rappels pour boire' },
  { key: 'plantes', label: 'Plantes', description: 'Le matin à 8 h, les plantes à arroser dans la journée', summary: 'plantes à arroser' },
]

/** Notifications qu'on recevra : page affichée et sujet non coupé. */
export function activeTopics(settings: UserSettings) {
  return NOTIFICATION_TOPICS.filter((t) => isPageEnabled(settings, t.key) && !settings.mutedNotifications.includes(t.key))
}

/** « listes de courses modifiées par l’autre et rappels pour boire ». */
export function describeTopics(topics: { summary: string }[]): string {
  const parts = topics.map((t) => t.summary)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : (parts[0] ?? '')
}

export interface UserSettings {
  disabledPages: PageKey[]
  mutedNotifications: NotificationTopic[]
  hydrationGoalMl: number
  hydrationContainers: WaterContainer[]
}

/** Valeurs tant que la personne n'a rien enregistré (identiques à celles de la base). */
export const DEFAULT_SETTINGS: UserSettings = { disabledPages: ['hydratation', 'tricot', 'plantes'], mutedNotifications: [], hydrationGoalMl: 1500, hydrationContainers: DEFAULT_CONTAINERS }

export const MIN_GOAL_ML = 500
export const MAX_GOAL_ML = 5000

export function isPageEnabled(settings: UserSettings, page: PageKey): boolean {
  return !settings.disabledPages.includes(page)
}

/** Page à laquelle appartient une adresse (« /courses/123 » → courses). */
export function pageOf(pathname: string): PageKey | null {
  return PAGES.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`))?.key ?? null
}

/** Accueil « Aujourd’hui » : toujours affiché, il résume les pages affichées. */
export const HOME_PATH = '/'

export type SectionKey = 'repas' | 'sante' | 'tricot' | 'plantes'

export interface SectionInfo {
  key: SectionKey
  label: string
  pages: PageKey[]
}

/** Sections de la navigation : chacune regroupe des pages. */
export const SECTIONS: SectionInfo[] = [
  { key: 'repas', label: 'Repas', pages: ['planning', 'recettes', 'courses'] },
  { key: 'sante', label: 'Santé', pages: ['poids', 'plan', 'hydratation'] },
  { key: 'tricot', label: 'Tricot', pages: ['tricot'] },
  { key: 'plantes', label: 'Plantes', pages: ['plantes'] },
]

/** Sections avec leurs pages affichées ; une section dont aucune page n'est affichée disparaît. */
export function visibleSections(isEnabled: (page: PageKey) => boolean): { section: SectionInfo; pages: PageInfo[] }[] {
  return SECTIONS.map((section) => ({ section, pages: PAGES.filter((p) => section.pages.includes(p.key) && isEnabled(p.key)) })).filter(
    (s) => s.pages.length > 0,
  )
}

/** Section d'une page. */
export function sectionOf(page: PageKey): SectionInfo {
  return SECTIONS.find((s) => s.pages.includes(page))!
}

export function togglePage(settings: UserSettings, page: PageKey, enabled: boolean): Partial<UserSettings> {
  const others = settings.disabledPages.filter((p) => p !== page)
  return { disabledPages: enabled ? others : [...others, page] }
}

export function toggleNotification(settings: UserSettings, topic: NotificationTopic, enabled: boolean): Partial<UserSettings> {
  const others = settings.mutedNotifications.filter((t) => t !== topic)
  return { mutedNotifications: enabled ? others : [...others, topic] }
}

/** « 1,5 » (litres) → 1500 ; null si invalide ou hors bornes. */
export function parseGoalLiters(value: string): number | null {
  const liters = Number(value.trim().replace(',', '.'))
  if (!Number.isFinite(liters) || value.trim() === '') return null
  const ml = Math.round(liters * 1000)
  return ml >= MIN_GOAL_ML && ml <= MAX_GOAL_ML ? ml : null
}

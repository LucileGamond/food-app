// Réglages de chacun : pages affichées, notifications reçues, objectif d'hydratation.

export type PageKey = 'planning' | 'recettes' | 'plan' | 'courses' | 'poids' | 'hydratation'
export type NotificationTopic = 'courses' | 'hydratation'

export interface PageInfo {
  key: PageKey
  to: string
  /** Nom court (onglets). */
  label: string
  /** Ce que contient la page (réglages). */
  description: string
}

export const PAGES: PageInfo[] = [
  { key: 'planning', to: '/planning', label: 'Planning', description: 'Repas de la semaine et idées à planifier' },
  { key: 'recettes', to: '/recettes', label: 'Recettes', description: 'Recettes enregistrées et mode cuisine' },
  { key: 'plan', to: '/plan', label: 'Plan', description: 'Suivi alimentaire' },
  { key: 'courses', to: '/courses', label: 'Courses', description: 'Listes de courses partagées' },
  { key: 'poids', to: '/poids', label: 'Poids', description: 'Suivi du poids' },
  { key: 'hydratation', to: '/hydratation', label: 'Eau', description: 'Suivi d’hydratation' },
]

export const NOTIFICATION_TOPICS: { key: NotificationTopic; label: string; description: string }[] = [
  { key: 'courses', label: 'Courses', description: 'Quand l’autre modifie une liste de courses' },
  { key: 'hydratation', label: 'Hydratation', description: 'Rappel après 4 h sans boire (9 h – 23 h), jusqu’à l’objectif' },
]

export interface UserSettings {
  disabledPages: PageKey[]
  mutedNotifications: NotificationTopic[]
  hydrationGoalMl: number
}

/** Valeurs tant que la personne n'a rien enregistré (identiques à celles de la base). */
export const DEFAULT_SETTINGS: UserSettings = { disabledPages: ['hydratation'], mutedNotifications: [], hydrationGoalMl: 1500 }

export const MIN_GOAL_ML = 500
export const MAX_GOAL_ML = 5000

export function isPageEnabled(settings: UserSettings, page: PageKey): boolean {
  return !settings.disabledPages.includes(page)
}

/** Page à laquelle appartient une adresse (« /courses/123 » → courses). */
export function pageOf(pathname: string): PageKey | null {
  return PAGES.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`))?.key ?? null
}

/** Première page affichée (accueil), sinon les réglages. */
export function homePath(settings: UserSettings): string {
  return PAGES.find((p) => isPageEnabled(settings, p.key))?.to ?? '/reglages'
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

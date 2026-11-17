// Ravelry : compte relié (OAuth, adresse de retour à déclarer dans l'application Ravelry), recherche de patrons et de
// laines.

import { decimal } from '@/lib/text'
import { NEEDLE_TOLERANCE_MM } from './yarn'

/** Page de l'application où Ravelry renvoie après l'autorisation. */
export const RAVELRY_CALLBACK_PATH = '/reglages/ravelry'

/** Adresse de retour complète (« http://localhost:5173/reglages/ravelry »). */
export function ravelryRedirectUri(origin: string = window.location.origin): string {
  return `${origin}${RAVELRY_CALLBACK_PATH}`
}

/** Va vers Ravelry (page d'autorisation) ; à part pour pouvoir le remplacer dans les tests. */
export const leaveFor = {
  go(url: string) {
    window.location.assign(url)
  },
}

/** Réponse de la fonction : un champ texte (« url », « username »). */
export const hasText =
  (key: string) =>
  (data: object): boolean =>
    typeof (data as Record<string, unknown>)[key] === 'string'

/** Réponse de la fonction : une liste (« yarns », « patterns »). */
export const hasList =
  (key: string) =>
  (data: object): boolean =>
    Array.isArray((data as Record<string, unknown>)[key])

/** Réponse de la fonction : un objet (« yarn »). */
export const hasObject =
  (key: string) =>
  (data: object): boolean => {
    const value = (data as Record<string, unknown>)[key]
    return typeof value === 'object' && value !== null
  }

/** Patron importé de Ravelry : adresse, nom et infos présents. */
export function isRavelryImport(data: object): boolean {
  return hasText('url')(data) && hasText('title')(data) && hasObject('ravelry')(data)
}

/** Tailles d'aiguilles du filtre « needles » de Ravelry, en mm. */
export const RAVELRY_NEEDLES_MM = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10, 12.75, 15, 19, 25,
]
const METERS_PER_YARD = 0.9144

export interface PatternSearchFilters {
  /** Grosseur de la laine (catégorie Ravelry). */
  weight?: string | null
  /** Métrage disponible : patrons qui en demandent au plus autant. */
  meters?: number | null
  /** Taille d'aiguilles de la laine : tailles Ravelry à 0,5 mm près. */
  needleMm?: number | null
}

/** 4 → « 4.0mm », 3.75 → « 3.75mm » (valeurs du filtre Ravelry). */
function ravelryNeedle(mm: number): string {
  return `${Number.isInteger(mm) ? mm.toFixed(1) : String(mm)}mm`
}

/**
 * Recherche de patrons sur Ravelry : tricot seulement, mots-clés proposés par le modèle et, si connus, grosseur de
 * la laine, métrage disponible (en yards pour Ravelry) et aiguilles proches de celles de la laine.
 */
export function patternSearchUrl(search: string, { weight = null, meters = null, needleMm = null }: PatternSearchFilters = {}): string {
  const needles = needleMm === null ? [] : RAVELRY_NEEDLES_MM.filter((mm) => Math.abs(mm - needleMm) <= NEEDLE_TOLERANCE_MM + 1e-9)
  const filters = [
    'craft=knitting',
    weight && `weight=${encodeURIComponent(weight)}`,
    meters !== null && meters > 0 && `yardage=0%7C${Math.floor(meters / METERS_PER_YARD)}`,
    needles.length > 0 && `needles=${needles.map(ravelryNeedle).join('%7C')}`,
    `query=${encodeURIComponent(search)}`,
  ]
  return `https://www.ravelry.com/patterns/search#${filters.filter(Boolean).join('&')}`
}

/** Laine trouvée sur Ravelry (aperçu de la recherche). */
export interface RavelryYarnHit {
  id: number
  brand: string | null
  name: string
  weightG: number | null
  lengthM: number | null
  /** Grosseur selon Ravelry (« DK »). */
  category: string | null
}

/** « Garnstudio · 50 g / 105 m · DK » : aperçu d'une laine trouvée sur Ravelry. */
export function ravelryYarnDetails(hit: RavelryYarnHit): string {
  const size = [hit.weightG !== null && `${decimal(hit.weightG)} g`, hit.lengthM !== null && `${hit.lengthM} m`].filter(Boolean).join(' / ')
  return [hit.brand, size, hit.category].filter(Boolean).join(' · ')
}

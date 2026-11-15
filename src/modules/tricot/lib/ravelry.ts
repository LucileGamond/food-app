// Compte Ravelry relié (OAuth) : adresse de retour de l'application, à déclarer dans l'application Ravelry.

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

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

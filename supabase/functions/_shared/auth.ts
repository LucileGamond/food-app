/** Garde : l'id de la personne connectée (ou true si la garde ne le donne pas), sinon null ou false. */
export type SignedInCheck = (authorization: string | null) => Promise<string | boolean | null>

/**
 * Garde des fonctions appelées par l'application : le jeton doit appartenir à un utilisateur connecté. C'est le service
 * d'authentification qui le dit (jeton expiré, révoqué ou clé publique seule : refusés). Renvoie l'id de la personne
 * (pour le suivi de la consommation), ou null.
 */
export function createSignedInCheck(supabaseUrl: string, anonKey: string, doFetch: typeof fetch = fetch) {
  return async function isSignedIn(authorization: string | null): Promise<string | null> {
    if (!authorization?.startsWith('Bearer ')) return null
    const response = await doFetch(`${supabaseUrl}/auth/v1/user`, { headers: { authorization, apikey: anonKey } }).catch(() => null)
    if (!response?.ok) return null
    const user = (await response.json().catch(() => null)) as { id?: string } | null
    return user?.id || null
  }
}

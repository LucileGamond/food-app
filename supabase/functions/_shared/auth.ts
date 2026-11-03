/**
 * Garde des fonctions appelées par l'application : le jeton doit appartenir à un utilisateur connecté. C'est le service
 * d'authentification qui le dit (jeton expiré, révoqué ou clé publique seule : refusés).
 */
export function createSignedInCheck(supabaseUrl: string, anonKey: string, doFetch: typeof fetch = fetch) {
  return async function isSignedIn(authorization: string | null): Promise<boolean> {
    if (!authorization?.startsWith('Bearer ')) return false
    const response = await doFetch(`${supabaseUrl}/auth/v1/user`, { headers: { authorization, apikey: anonKey } }).catch(() => null)
    if (!response?.ok) return false
    const user = (await response.json().catch(() => null)) as { id?: string } | null
    return Boolean(user?.id)
  }
}

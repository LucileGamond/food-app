/**
 * Adresses iCal acceptées : celles des agendas Google (« Adresse secrète au format iCal »), et rien d'autre. Le
 * serveur ne va donc chercher que chez Google (pas d'adresse interne ou arbitraire). La même règle est vérifiée par
 * la base (contrainte de calendar_source_credentials).
 */

const GOOGLE_ICAL_URL = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/?#\s]+\/[^/?#\s]+\/basic\.ics$/

/** Adresse nettoyée (espaces, « webcal:// » → « https:// »), ou null si ce n'est pas une adresse iCal Google. */
export function normalizeIcalUrl(input: string): string | null {
  const url = input.trim().replace(/^webcal:\/\//i, 'https://')
  return GOOGLE_ICAL_URL.test(url) ? url : null
}

/** Adresse finale d'une réponse (après redirections) toujours chez Google. */
export function isGoogleHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'google.com' || hostname.endsWith('.google.com'))
  } catch {
    return false
  }
}

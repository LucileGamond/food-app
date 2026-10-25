// Vérification des adresses que la fonction accepte de télécharger (protection SSRF) :
// uniquement http(s) vers un hôte public, sur le port par défaut.

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null
    value = value * 256 + Number(part)
  }
  return value
}

function inRange(ip: number, base: string, bits: number): boolean {
  const start = ipv4ToInt(base)!
  const size = 2 ** (32 - bits)
  return ip >= start && ip < start + size
}

export function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip)
  if (value === null) return false
  return (
    inRange(value, '0.0.0.0', 8) ||
    inRange(value, '10.0.0.0', 8) ||
    inRange(value, '100.64.0.0', 10) ||
    inRange(value, '127.0.0.0', 8) ||
    inRange(value, '169.254.0.0', 16) ||
    inRange(value, '172.16.0.0', 12) ||
    inRange(value, '192.168.0.0', 16) ||
    inRange(value, '192.0.0.0', 24) ||
    inRange(value, '192.0.2.0', 24) ||
    inRange(value, '198.18.0.0', 15) ||
    inRange(value, '198.51.100.0', 24) ||
    inRange(value, '203.0.113.0', 24) ||
    inRange(value, '224.0.0.0', 3) // multicast et réservé
  )
}

export function isPrivateIpv6(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (!ip.includes(':')) return false
  // Seules les adresses publiques (2000::/3) sont acceptées, hors 6to4 (2002::/16) et documentation (2001:db8::/32) :
  // tout le reste (::1, ::ffff:…, ::7f00:1, 64:ff9b::…, fc00::/7, fe80::/10, ff00::/8…) est refusé.
  if (!/^[23][0-9a-f]{0,3}:/.test(ip)) return true
  return ip.startsWith('2002:') || ip.startsWith('2001:db8:') || ip.startsWith('2001:0db8:')
}

export type ResolveDns = (host: string, type: 'A' | 'AAAA') => Promise<string[]>

/**
 * Faux si le nom d'hôte pointe vers une adresse privée (ex. 127.0.0.1.nip.io). Une résolution impossible
 * (nom inexistant, résolveur indisponible) ne bloque pas : le téléchargement échouera alors de lui-même.
 */
export async function resolvesToPublic(host: string, resolve: ResolveDns): Promise<boolean> {
  if (/^[\d.]+$/.test(host) || host.includes(':')) return true // adresse IP : déjà vérifiée
  const lookups = await Promise.all((['A', 'AAAA'] as const).map((type) => resolve(host, type).catch(() => [] as string[])))
  return lookups.flat().every((ip) => !isPrivateIpv4(ip) && !(ip.includes(':') && isPrivateIpv6(ip)))
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/** Adresse publique http(s) téléchargeable, ou la raison du refus. */
export function checkPublicUrl(raw: unknown, base?: URL): UrlCheck {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > 2000) return { ok: false, reason: 'Adresse manquante ou trop longue.' }
  let url: URL
  try {
    url = new URL(raw.trim(), base)
  } catch {
    return { ok: false, reason: 'Adresse invalide.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'Seules les adresses http(s) sont acceptées.' }
  if (url.username || url.password) return { ok: false, reason: 'Adresse invalide.' }
  if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: 'Adresse non autorisée.' }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    host === '' ||
    host === 'localhost' ||
    !host.includes('.') && !host.includes(':') ||
    /\.(localhost|local|internal|lan|home|corp|test)$/.test(host) ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host) ||
    // Formes numériques déguisées (ex. 2130706433, 0x7f.1) : refusées.
    /^[\d.]+$/.test(host) && ipv4ToInt(host) === null ||
    /^0x/i.test(host)
  ) {
    return { ok: false, reason: 'Adresse non autorisée.' }
  }
  url.hash = ''
  return { ok: true, url }
}

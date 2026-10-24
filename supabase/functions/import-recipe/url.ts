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
    inRange(value, '224.0.0.0', 3) // multicast et réservé
  )
}

function isPrivateIpv6(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (!ip.includes(':')) return false
  if (ip === '::' || ip === '::1') return true
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
  if (mapped) return isPrivateIpv4(mapped[1]!)
  // Toute autre forme ::ffff:… (notation hexadécimale) est refusée par prudence.
  if (ip.startsWith('::ffff:')) return true
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip)
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

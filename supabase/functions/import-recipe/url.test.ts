import { checkPublicUrl, isPrivateIpv4 } from './url.ts'

const ok = (raw: string) => checkPublicUrl(raw).ok

describe('checkPublicUrl', () => {
  it('accepte les adresses publiques http(s)', () => {
    expect(ok('https://www.marmiton.org/recettes/recette_crepes.aspx')).toBe(true)
    expect(ok('http://exemple.fr:80/a')).toBe(true)
    expect(ok('https://8.8.8.8/')).toBe(true)
    const check = checkPublicUrl('  https://exemple.fr/recette#etapes ')
    expect(check.ok && check.url.href).toBe('https://exemple.fr/recette')
  })

  it('résout une redirection relative', () => {
    const check = checkPublicUrl('/autre', new URL('https://exemple.fr/a'))
    expect(check.ok && check.url.href).toBe('https://exemple.fr/autre')
  })

  it('refuse les adresses invalides ou non web', () => {
    expect(checkPublicUrl('')).toEqual({ ok: false, reason: 'Adresse manquante ou trop longue.' })
    expect(checkPublicUrl(42)).toMatchObject({ ok: false })
    expect(checkPublicUrl(`https://exemple.fr/${'a'.repeat(2000)}`)).toMatchObject({ ok: false })
    expect(checkPublicUrl('pas une url')).toEqual({ ok: false, reason: 'Adresse invalide.' })
    expect(checkPublicUrl('ftp://exemple.fr/x')).toEqual({ ok: false, reason: 'Seules les adresses http(s) sont acceptées.' })
    expect(checkPublicUrl('file:///etc/passwd')).toMatchObject({ ok: false })
    expect(checkPublicUrl('https://user:pass@exemple.fr/')).toMatchObject({ ok: false })
  })

  it('refuse le réseau local et les ports exotiques (SSRF)', () => {
    for (const raw of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://10.1.2.3/',
      'http://172.20.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.0.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:7f00:1]/',
      'http://2130706433/',
      'http://0x7f.0.0.1/',
      'http://intranet/',
      'http://supabase_db_food-app/',
      'http://api.local/',
      'http://kong.internal/',
      'https://exemple.fr:8080/',
      'http://exemple.fr:54321/',
    ]) {
      expect(checkPublicUrl(raw), raw).toMatchObject({ ok: false })
    }
  })

  it('reconnaît les plages IPv4 privées', () => {
    expect(isPrivateIpv4('172.15.255.255')).toBe(false)
    expect(isPrivateIpv4('172.31.255.255')).toBe(true)
    expect(isPrivateIpv4('192.169.0.1')).toBe(false)
    expect(isPrivateIpv4('239.1.1.1')).toBe(true)
    expect(isPrivateIpv4('999.1.1.1')).toBe(false)
  })
})

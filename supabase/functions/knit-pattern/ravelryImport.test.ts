import { createHandler } from './handler.ts'
import { importRavelryPattern, listRavelryImports, mergeImportItems, pickAttachment, ravelryUsername } from './ravelry.ts'
import type { RavelryOAuth, RavelryStore } from './ravelryAuth.ts'

const FAVORITES = [
  {
    type: 'pattern',
    favorited: { id: 1, name: 'Loulou Lace Shawl', pattern_author: { name: 'Gabrielle Vézina' }, first_photo: { square_url: 'http://img.exemple/loulou.jpg' } },
  },
  // Favori d'un autre type : ignoré ; doublon : gardé une fois
  { type: 'yarn', favorited: { id: 9, name: 'Laine' } },
  { type: 'pattern', favorited: { id: 1, name: 'Loulou Lace Shawl' } },
  { type: 'pattern', favorited: { id: 2, name: 'Cinder', designer: { name: 'Jared Flood' }, first_photo: null } },
]
const VOLUMES = [
  { id: 100, pattern_id: 3, title: 'Fern Field Scarf', author_name: 'Lisa Hannes', has_downloads: true, square_image_url: 'https://img.exemple/fern.jpg' },
  // Déjà en favori : réuni
  { id: 101, pattern_id: 2, title: 'Cinder', author_name: 'Jared Flood', has_downloads: true },
  // Volume sans patron (livre entier) : ignoré
  { id: 102, pattern_id: null, title: 'Un livre' },
]

const PATTERN = {
  id: 3,
  name: 'Fern Field Scarf',
  permalink: 'fern-field-scarf-2',
  pattern_author: { name: 'Lisa Hannes' },
  yardage: 378,
  sizes_available: 'One size',
  pattern_needle_sizes: [{ metric: 4.5 }],
  packs: [{ yarn_name: 'Cardiff Cashmere Brushlight' }],
  photos: [{ medium_url: 'http://img.exemple/fern_medium.jpg' }],
}
const VOLUME = {
  volume_attachments: [
    { product_attachment_id: 7, filename: 'Fern_DE.pdf', content_type: 'application/pdf', language_code: 'de' },
    { product_attachment_id: 8, filename: 'Fern_EN.pdf', content_type: 'application/pdf', language_code: 'en' },
  ],
}

/** Faux Ravelry : une réponse par chemin d'API ; `downloads` : réponse du lien de PDF. */
function ravelry(downloads: () => Response = () => Response.json({ download_link: { url: 'https://library.exemple/fern.pdf', expires_at: '2026/11/15 10:21:01 -0500' } })) {
  return vi.fn<typeof fetch>(async (input) => {
    const path = new URL(String(input)).pathname
    if (path === '/current_user.json') return Response.json({ user: { username: 'Youcite' } })
    if (path === '/people/Youcite/favorites/list.json') return Response.json({ favorites: FAVORITES })
    if (path === '/people/Youcite/library/search.json') return Response.json({ volumes: VOLUMES })
    if (path === '/patterns/3.json') return Response.json({ pattern: PATTERN })
    if (path === '/volumes/100.json') return Response.json({ volume: VOLUME })
    if (path.startsWith('/product_attachments/')) return downloads()
    return new Response('', { status: 404 })
  })
}

function oauth(fetchRavelry: typeof fetch, linked = true): RavelryOAuth {
  const store: RavelryStore = {
    saveState: vi.fn(),
    takeState: vi.fn(),
    saveAccount: vi.fn(),
    loadTokens: vi.fn(async () => (linked ? { accessToken: 'jeton', refreshToken: 'r', expiresAt: Date.now() + 3_600_000 } : null)),
    saveTokens: vi.fn(),
  }
  return { clientId: 'client', redirectUris: [], fetch: fetchRavelry, store }
}

const post = (body: unknown) => new Request('https://fn.test/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

describe('import depuis Ravelry : liste', () => {
  it('réunit favoris et bibliothèque par patron, adresses en https', () => {
    expect(mergeImportItems(FAVORITES, VOLUMES)).toEqual([
      { patternId: 1, title: 'Loulou Lace Shawl', author: 'Gabrielle Vézina', photoUrl: 'https://img.exemple/loulou.jpg', sources: ['favori'], volumeId: null, hasPdf: false },
      { patternId: 2, title: 'Cinder', author: 'Jared Flood', photoUrl: null, sources: ['favori', 'bibliothèque'], volumeId: 101, hasPdf: true },
      { patternId: 3, title: 'Fern Field Scarf', author: 'Lisa Hannes', photoUrl: 'https://img.exemple/fern.jpg', sources: ['bibliothèque'], volumeId: 100, hasPdf: true },
    ])
    expect(mergeImportItems(null, undefined)).toEqual([])
  })

  it('lit le nom du compte, puis ses favoris (patrons) et sa bibliothèque', async () => {
    const fetchRavelry = ravelry()
    const items = await listRavelryImports({ fetchRavelry, accessToken: 'jeton' })
    expect(items.map((i) => i.patternId)).toEqual([1, 2, 3])
    const urls = fetchRavelry.mock.calls.map(([u]) => new URL(String(u)))
    expect(urls.find((u) => u.pathname.includes('favorites'))!.searchParams.get('types')).toBe('pattern')
    expect(urls.find((u) => u.pathname.includes('library'))!.searchParams.get('page_size')).toBe('100')
  })

  it('nom de compte illisible : erreur', async () => {
    await expect(ravelryUsername({ fetchRavelry: vi.fn<typeof fetch>(async () => Response.json({ user: { username: '../x' } })), accessToken: 'j' })).rejects.toThrow('Compte Ravelry illisible.')
  })
})

describe('import depuis Ravelry : un patron', () => {
  it('fichier du volume : français, sinon anglais, sinon le premier PDF', () => {
    expect(pickAttachment(VOLUME.volume_attachments)).toEqual({ id: 8, name: 'Fern_EN.pdf' })
    expect(pickAttachment([...VOLUME.volume_attachments, { product_attachment_id: 9, filename: 'Fern_FR.pdf', language_code: 'fr' }])).toEqual({ id: 9, name: 'Fern_FR.pdf' })
    expect(pickAttachment([{ product_attachment_id: 1, filename: 'a.zip', content_type: 'application/zip' }])).toBeNull()
    expect(pickAttachment(null)).toBeNull()
  })

  it('patron de la bibliothèque : page, nom, créatrice, infos, photo, lien du PDF (POST)', async () => {
    const fetchRavelry = ravelry()
    const found = await importRavelryPattern(3, 100, { fetchRavelry, accessToken: 'jeton' })
    expect(found).toEqual({
      url: 'https://www.ravelry.com/patterns/library/fern-field-scarf-2',
      title: 'Fern Field Scarf',
      author: 'Lisa Hannes',
      info: { title: 'Fern Field Scarf', sizes: [], meters: [346], needleMm: 4.5, yarn: 'Cardiff Cashmere Brushlight', kind: null },
      photoUrl: 'https://img.exemple/fern_medium.jpg',
      pdf: { url: 'https://library.exemple/fern.pdf', name: 'Fern_EN.pdf' },
      pdfMissing: null,
    })
    const generate = fetchRavelry.mock.calls.find(([u]) => String(u).includes('/product_attachments/8/generate_download_link.json'))!
    expect(generate[1]!.method).toBe('POST')
  })

  it('PDF : permission manquante, aucun lien, aucun fichier ; favori seul : pas de PDF', async () => {
    const forbidden = await importRavelryPattern(3, 100, { fetchRavelry: ravelry(() => new Response('{}', { status: 403 })), accessToken: 'j' })
    expect([forbidden.pdf, forbidden.pdfMissing]).toEqual([null, 'permission'])
    const noLink = await importRavelryPattern(3, 100, { fetchRavelry: ravelry(() => Response.json({})), accessToken: 'j' })
    expect([noLink.pdf, noLink.pdfMissing]).toEqual([null, 'aucun'])
    const favorite = await importRavelryPattern(3, null, { fetchRavelry: ravelry(), accessToken: 'j' })
    expect([favorite.pdf, favorite.pdfMissing]).toEqual([null, 'aucun'])
    // Volume sans PDF
    const empty = vi.fn<typeof fetch>(async (input) => (String(input).includes('/volumes/') ? Response.json({ volume: { volume_attachments: [] } }) : Response.json({ pattern: PATTERN })))
    expect((await importRavelryPattern(3, 100, { fetchRavelry: empty, accessToken: 'j' })).pdfMissing).toBe('aucun')
  })

  it('patron introuvable : erreur ; Ravelry en panne pendant le lien du PDF : l’erreur remonte', async () => {
    const missing = vi.fn<typeof fetch>(async () => Response.json({ pattern: { name: 'Sans adresse' } }))
    await expect(importRavelryPattern(1, null, { fetchRavelry: missing, accessToken: 'j' })).rejects.toThrow('Patron introuvable sur Ravelry.')
    await expect(importRavelryPattern(3, 100, { fetchRavelry: ravelry(() => new Response('', { status: 500 })), accessToken: 'j' })).rejects.toThrow('Ravelry a répondu par une erreur (500).')
  })
})

describe('import depuis Ravelry : fonction', () => {
  const PDF = new TextEncoder().encode('%PDF-1.4 patron')

  it('liste, puis importe avec la photo et le PDF téléchargés, sans le modèle', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const fetchPage = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('.pdf') ? new Response(PDF, { headers: { 'content-type': 'application/octet-stream' } }) : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
    )
    const log = vi.fn()
    const handle = createHandler({ apiKey: undefined, fetchModel, fetchPage, log, isSignedIn: async () => 'u1', ravelry: oauth(ravelry()) })

    const list = await handle(post({ ravelry_imports: {} }))
    expect(list.status).toBe(200)
    expect((await list.json()).patterns).toHaveLength(3)

    const response = await handle(post({ ravelry_import: { pattern_id: 3, volume_id: 100 } }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ url: 'https://www.ravelry.com/patterns/library/fern-field-scarf-2', title: 'Fern Field Scarf', author: 'Lisa Hannes', pdfMissing: null, ravelry: { needleMm: 4.5 } })
    expect(body.image).toEqual({ data: btoa('\u0001\u0002\u0003'), type: 'image/jpeg' })
    expect(body.pdf).toEqual({ data: btoa('%PDF-1.4 patron'), name: 'Fern_EN.pdf' })
    expect(fetchModel).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ravelryImport: true, image: true, pdf: true, pdfMissing: null }))
  })

  it('PDF qui ne se télécharge pas ou n’en est pas un : « erreur » ; photo absente : sans photo', async () => {
    const fetchPage = vi.fn<typeof fetch>(async () => new Response('<html>connexion</html>', { headers: { 'content-type': 'text/html' } }))
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), fetchPage, isSignedIn: async () => 'u1', ravelry: oauth(ravelry()) })
    const body = await (await handle(post({ ravelry_import: { pattern_id: 3, volume_id: 100 } }))).json()
    expect([body.image, body.pdf, body.pdfMissing]).toEqual([null, null, 'erreur'])
  })

  it('demandes invalides : 400 ; compte non relié : 409', async () => {
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1', ravelry: oauth(ravelry()) })
    for (const body of [{ ravelry_import: { pattern_id: 0 } }, { ravelry_import: { pattern_id: 3, volume_id: 'x' } }, { ravelry_import: {} }]) {
      expect((await handle(post(body))).status).toBe(400)
    }
    const unlinked = createHandler({ apiKey: 'cle', fetchModel: vi.fn(), isSignedIn: async () => 'u1', ravelry: oauth(ravelry(), false) })
    expect((await unlinked(post({ ravelry_imports: {} }))).status).toBe(409)
  })
})

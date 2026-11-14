import { HttpError } from '../_shared/anthropic.ts'
import { createHandler } from './handler.ts'
import { MAX_LINK_PDF_BYTES, nameFromUrl, parseLinkInput, readLink, readPageInfo } from './link.ts'

const PDF_BYTES = '%PDF-1.4\n%patron'
const pdf = (headers: Record<string, string> = { 'content-type': 'application/pdf' }) => new Response(PDF_BYTES, { headers })
const html = (body: string) => new Response(`<html><head>${body}</head></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } })
const PNG = new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })

/** Faux réseau : une réponse par adresse ; les autres répondent 404. */
function site(pages: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const page = pages[String(input)]
    return page ? page() : new Response('introuvable', { status: 404 })
  })
}

describe('lien d’un patron : lecture de la requête', () => {
  it('reconnaît { link: { url } } et refuse une adresse privée', () => {
    expect(parseLinkInput({ pdf: 'x' })).toBeNull()
    expect(parseLinkInput({ link: { url: 'https://patrons.exemple/gilet' } })).toEqual({ url: 'https://patrons.exemple/gilet' })
    expect(() => parseLinkInput({ link: { url: 'http://127.0.0.1/admin' } })).toThrow(HttpError)
    expect(() => parseLinkInput({ link: { url: 'ftp://patrons.exemple' } })).toThrow('Seules les adresses http(s) sont acceptées.')
    expect(() => parseLinkInput({ link: {} })).toThrow(HttpError)
  })

  it('tire un nom du fichier', () => {
    expect(nameFromUrl('https://p.exemple/files/Pull%20Bergamote.pdf')).toBe('Pull Bergamote')
    expect(nameFromUrl('https://p.exemple/gilet_rosee+v2.PDF?x=1')).toBe('gilet rosee v2')
    expect(nameFromUrl('https://p.exemple/')).toBeNull()
  })
})

describe('lien d’un patron : page web', () => {
  const PAGE = `
    <title>Gilet Rosée – Le blog</title>
    <meta property="og:title" content="Gilet Rosée">
    <meta property="og:image" content="/img/gilet.png">
    <body>
      <a href="/cgv.pdf">Conditions de vente</a>
      <a href="https://p.exemple/files/gilet-rosee.pdf">Télécharger le patron</a>
      <a href="/files/gilet-rosee.pdf">Encore le patron</a>
      <a href="/page">Autre page</a>
      <a href="http://192.168.0.1/piege.pdf">Patron</a>
    </body>`

  it('donne le nom, l’image et les PDF, les plus probables d’abord', () => {
    expect(readPageInfo(PAGE, 'https://p.exemple/gilet')).toEqual({
      title: 'Gilet Rosée',
      imageUrl: 'https://p.exemple/img/gilet.png',
      pdfLinks: ['https://p.exemple/files/gilet-rosee.pdf', 'https://p.exemple/cgv.pdf'],
    })
    expect(readPageInfo('<title> Bonnet  simple </title>', 'https://p.exemple/')).toEqual({ title: 'Bonnet simple', imageUrl: null, pdfLinks: [] })
  })

  it('télécharge l’image et le PDF trouvés dans la page', async () => {
    const fetchPage = site({
      'https://p.exemple/gilet': () => html(PAGE),
      'https://p.exemple/img/gilet.png': () => PNG.clone(),
      'https://p.exemple/files/gilet-rosee.pdf': () => pdf(),
    })
    const result = await readLink({ url: 'https://p.exemple/gilet' }, { fetchPage })
    expect(result).toMatchObject({ url: 'https://p.exemple/gilet', title: 'Gilet Rosée', image: { type: 'image/png' }, pdf: { name: 'gilet-rosee.pdf' } })
    expect(atob(result.pdf!.data)).toBe(PDF_BYTES)
  })

  it('PDF réservé (connexion demandée) : le lien et le nom sont gardés, sans PDF ni erreur', async () => {
    const fetchPage = site({
      'https://p.exemple/gilet': () => html(PAGE),
      'https://p.exemple/files/gilet-rosee.pdf': () => html('<title>Connexion</title>'),
      'https://p.exemple/cgv.pdf': () => new Response('interdit', { status: 403 }),
    })
    const result = await readLink({ url: 'https://p.exemple/gilet' }, { fetchPage })
    expect(result).toEqual({ url: 'https://p.exemple/gilet', title: 'Gilet Rosée', image: null, pdf: null })
  })

  it('n’essaie que les deux premiers PDF de la page', async () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="/p${i}.pdf">patron ${i}</a>`).join('')
    const fetchPage = site({ 'https://p.exemple/x': () => html(links) })
    await readLink({ url: 'https://p.exemple/x' }, { fetchPage })
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })
})

describe('lien d’un patron : PDF direct', () => {
  it('garde le PDF, nommé d’après le fichier', async () => {
    const fetchPage = site({ 'https://p.exemple/Pull%20Bergamote.pdf': () => pdf() })
    const result = await readLink({ url: 'https://p.exemple/Pull%20Bergamote.pdf' }, { fetchPage })
    expect(result).toMatchObject({ title: 'Pull Bergamote', image: null, pdf: { name: 'Pull Bergamote.pdf' } })
  })

  it('reconnaît un PDF à son contenu, même mal annoncé', async () => {
    const fetchPage = site({ 'https://p.exemple/telecharger?id=4': () => pdf({ 'content-type': 'application/octet-stream' }) })
    expect((await readLink({ url: 'https://p.exemple/telecharger?id=4' }, { fetchPage })).pdf).not.toBeNull()
  })

  it('refuse ce qui n’est ni une page ni un PDF, et un fichier trop lourd', async () => {
    const image = site({ 'https://p.exemple/photo.png': () => PNG.clone() })
    await expect(readLink({ url: 'https://p.exemple/photo.png' }, { fetchPage: image })).rejects.toThrow('Ce lien ne mène ni à une page ni à un PDF.')
    const heavy = site({ 'https://p.exemple/gros.pdf': () => new Response(PDF_BYTES, { headers: { 'content-length': String(MAX_LINK_PDF_BYTES + 1) } }) })
    await expect(readLink({ url: 'https://p.exemple/gros.pdf' }, { fetchPage: heavy })).rejects.toThrow('Fichier trop lourd (20 Mo au plus).')
  })

  it('site injoignable : erreur lisible', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }))
    await expect(readLink({ url: 'https://p.exemple/x' }, { fetchPage: down })).rejects.toThrow('Le site a répondu par une erreur (500).')
  })
})

describe('lien d’un patron : fonction', () => {
  it('répond sans clé du modèle ni budget, et sans appeler le modèle', async () => {
    const fetchModel = vi.fn<typeof fetch>()
    const checkBudget = vi.fn(async () => 'Budget atteint.')
    const fetchPage = site({ 'https://p.exemple/p.pdf': () => pdf() })
    const handle = createHandler({ apiKey: undefined, fetchModel, fetchPage, checkBudget, isSignedIn: async () => true })
    const response = await handle(new Request('https://fn.test/knit-pattern', { method: 'POST', body: JSON.stringify({ link: { url: 'https://p.exemple/p.pdf' } }) }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ title: 'p', pdf: { name: 'p.pdf' } })
    expect(fetchModel).not.toHaveBeenCalled()
    expect(checkBudget).not.toHaveBeenCalled()
  })

  it('adresse refusée : 400', async () => {
    const handle = createHandler({ apiKey: 'cle', fetchModel: vi.fn<typeof fetch>(), fetchPage: vi.fn<typeof fetch>(), isSignedIn: async () => true })
    const response = await handle(new Request('https://fn.test/knit-pattern', { method: 'POST', body: JSON.stringify({ link: { url: 'http://localhost/x' } }) }))
    expect(response.status).toBe(400)
  })
})

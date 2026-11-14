import {
  EMPTY_PATTERN_DRAFT,
  isReadableLink,
  linkAdditions,
  patternFormChanged,
  patternLinkFromResponse,
  filterPatterns,
  matchPatterns,
  parsePatternDraft,
  patternFacts,
  patternFormats,
  sortPatterns,
  titleFromFile,
  toPatternDraft,
  type KnitPattern,
  type PatternFiles,
} from './library'
import type { Yarn } from './yarn'

const NO_FILES: PatternFiles = { pdfPath: null, newPdf: null, photos: [], newPhotos: [] }
const pdf = new File(['%PDF'], 'pull.pdf', { type: 'application/pdf' })
const WITH_PDF: PatternFiles = { ...NO_FILES, newPdf: pdf }

function pattern(id: string, patch: Partial<KnitPattern> = {}): KnitPattern {
  return {
    id,
    title: id,
    pdfPath: null,
    photos: [],
    url: null,
    size: null,
    yarnIdea: '',
    notes: '',
    metersNeeded: null,
    needleMm: null,
    wish: 2,
    createdAt: '2026-11-01',
    projects: [],
    readSizes: [],
    ...patch,
  }
}

describe('saisie d’un patron', () => {
  const draft = { ...EMPTY_PATTERN_DRAFT, title: ' Pull ', size: ' M ' }

  it('nettoie la saisie', () => {
    expect(parsePatternDraft(draft, WITH_PDF)).toEqual({
      fields: { title: 'Pull', url: null, size: 'M', yarnIdea: '', notes: '', metersNeeded: null, needleMm: null, wish: 2 },
    })
    expect(parsePatternDraft({ ...draft, metersNeeded: '350', needleMm: '4,5', wish: null }, WITH_PDF)).toMatchObject({ fields: { metersNeeded: 350, needleMm: 4.5, wish: null } })
  })

  it('accepte chaque format seul : PDF, photo déjà gardée ou nouvelle, lien', () => {
    expect(parsePatternDraft(draft, { ...NO_FILES, pdfPath: 'u/p.pdf' })).toHaveProperty('fields')
    expect(parsePatternDraft(draft, { ...NO_FILES, photos: ['u/a.jpg'] })).toHaveProperty('fields')
    expect(parsePatternDraft(draft, { ...NO_FILES, newPhotos: [new Blob()] })).toHaveProperty('fields')
    expect(parsePatternDraft({ ...draft, url: 'https://patrons.exemple/pull' }, NO_FILES)).toMatchObject({ fields: { url: 'https://patrons.exemple/pull' } })
  })

  it('donne le premier problème', () => {
    expect(parsePatternDraft(draft, NO_FILES)).toEqual({ error: 'Ajoute le patron : un PDF, des photos ou un lien.' })
    expect(parsePatternDraft({ ...draft, title: ' ' }, WITH_PDF)).toEqual({ error: 'Donne un nom au patron.' })
    expect(parsePatternDraft({ ...draft, title: 'x'.repeat(201) }, WITH_PDF)).toEqual({ error: 'Nom : 200 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, url: 'patrons.exemple' }, NO_FILES)).toEqual({ error: 'Le lien doit commencer par http:// ou https://.' })
    expect(parsePatternDraft({ ...draft, url: `https://${'x'.repeat(2000)}` }, NO_FILES)).toEqual({ error: 'Lien : 2000 caractères au plus.' })
    expect(parsePatternDraft(draft, { ...NO_FILES, photos: Array.from({ length: 8 }, (_, i) => `u/${i}.jpg`), newPhotos: [new Blob(), new Blob(), new Blob()] })).toEqual({
      error: '10 photos au plus.',
    })
    expect(parsePatternDraft({ ...draft, size: 'x'.repeat(41) }, WITH_PDF)).toEqual({ error: 'Taille : 40 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, yarnIdea: 'x'.repeat(201) }, WITH_PDF)).toEqual({ error: 'Laine envisagée : 200 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, notes: 'x'.repeat(2001) }, WITH_PDF)).toEqual({ error: 'Notes : 2000 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, metersNeeded: '35,5' }, WITH_PDF)).toEqual({ error: 'Métrage : un nombre entier de mètres (1 à 20 000).' })
    expect(parsePatternDraft({ ...draft, needleMm: '50' }, WITH_PDF)).toEqual({ error: 'Aiguilles : entre 1 et 30 mm.' })
  })

  it('cohérence : un patron enregistré, remis en saisie, redonne les mêmes champs', () => {
    const saved = pattern('Gilet', { url: 'https://patrons.exemple/gilet', size: 'M', yarnIdea: 'Mérinos', notes: 'Col V', metersNeeded: 600, needleMm: 3.75, wish: 1 })
    const parsed = parsePatternDraft(toPatternDraft(saved), NO_FILES)
    expect(parsed).toEqual({ fields: { title: 'Gilet', url: saved.url, size: 'M', yarnIdea: 'Mérinos', notes: 'Col V', metersNeeded: 600, needleMm: 3.75, wish: 1 } })
    expect(toPatternDraft(saved).needleMm).toBe('3,75')
  })

  it('propose un nom d’après le fichier', () => {
    expect(titleFromFile('pull-bergamote.pdf')).toBe('pull-bergamote')
    expect(titleFromFile('Châle.v2.JPG')).toBe('Châle.v2')
  })
})

describe('liste des patrons', () => {
  it('les envies d’abord (les plus pressées, puis les plus anciennes), puis les autres, les plus récents d’abord', () => {
    const items = [
      pattern('archive-ancien', { wish: null, createdAt: '2026-01-01' }),
      pattern('peut-etre', { wish: 3, createdAt: '2026-01-01' }),
      pattern('bientot-recent', { wish: 1, createdAt: '2026-03-01' }),
      pattern('archive-recent', { wish: null, createdAt: '2026-05-01' }),
      pattern('bientot-ancien', { wish: 1, createdAt: '2026-02-01' }),
    ]
    expect(sortPatterns(items).map((p) => p.id)).toEqual(['bientot-ancien', 'bientot-recent', 'peut-etre', 'archive-recent', 'archive-ancien'])
  })

  it('cherche sans tenir compte des accents ni de la casse, dans le titre, les notes, la laine et les projets', () => {
    const items = [
      pattern('Gilet Rosée', { notes: 'col V' }),
      pattern('Pull', { yarnIdea: 'Mérinos bleu' }),
      pattern('Bonnet', { projects: [{ id: 'p', title: 'Bonnet de Noël', size: 'S' }] }),
    ]
    expect(filterPatterns(items, 'rosee', 'all').map((p) => p.id)).toEqual(['Gilet Rosée'])
    expect(filterPatterns(items, 'MERINOS', 'all').map((p) => p.id)).toEqual(['Pull'])
    expect(filterPatterns(items, 'noel', 'all').map((p) => p.id)).toEqual(['Bonnet'])
    expect(filterPatterns(items, 'gilet col', 'all').map((p) => p.id)).toEqual(['Gilet Rosée'])
    expect(filterPatterns(items, 'gilet pull', 'all')).toEqual([])
    expect(filterPatterns(items, '  ', 'all')).toHaveLength(3)
  })

  it('filtre les patrons à faire et ceux déjà commencés ; les deux filtres se partagent tous les patrons', () => {
    const items = [pattern('a'), pattern('b', { projects: [{ id: 'p', title: 'B', size: 'M' }] }), pattern('c', { wish: null })]
    const todo = filterPatterns(items, '', 'todo').map((p) => p.id)
    const started = filterPatterns(items, '', 'started').map((p) => p.id)
    expect(todo).toEqual(['a', 'c'])
    expect(started).toEqual(['b'])
    expect([...todo, ...started].toSorted()).toEqual(filterPatterns(items, '', 'all').map((p) => p.id).toSorted())
  })

  it('résume un patron : envie ou projets, taille, besoins, laine', () => {
    expect(patternFacts(pattern('Gilet', { wish: 1, size: 'M', metersNeeded: 600, needleMm: 3.5, yarnIdea: 'Mérinos' }))).toEqual(['Bientôt', 'taille M', '600 m', 'aiguilles 3,5 mm', 'Mérinos'])
    expect(patternFacts(pattern('Pull', { wish: null, projects: [{ id: '1', title: 'Pull', size: 'M' }, { id: '2', title: 'Pull 2', size: 'L' }] }))).toEqual(['2 projets'])
    expect(patternFacts(pattern('Bonnet', { wish: null }))).toEqual([])
  })

  it('liste les formats', () => {
    expect(patternFormats({ pdfPath: 'u/p.pdf', photos: ['a', 'b'], url: 'https://x' })).toEqual(['PDF', '2 photos', 'lien'])
    expect(patternFormats({ pdfPath: null, photos: ['a'], url: null })).toEqual(['1 photo'])
  })
})

describe('quel patron pour ma laine', () => {
  const PARTNER: Yarn = { brand: 'Phildar', name: 'Partner 3.5', color: null, dye_lot: null, composition: null, weight_g: 50, length_m: 125, skeins: 6, needle_mm: 3.5 }
  const needs = (id: string, metersNeeded: number | null, needleMm: number | null, wish: 1 | 2 | 3 | null = 2) => pattern(id, { metersNeeded, needleMm, wish })

  it('garde les patrons dont le métrage et les aiguilles conviennent, met à part ceux qu’on ne peut pas juger', () => {
    // 6 pelotes de 125 m (750 m), aiguilles 3,5 mm.
    const result = matchPatterns(PARTNER, [needs('Pull', 900, 3.5), needs('Gilet', 600, 4, 1), needs('Châle', 400, 6), needs('Bonnet', null, null), needs('Snood', 200, null)])
    expect(result.fits.map((m) => [m.item.id, m.reasons])).toEqual([
      ['Gilet', ['600 m nécessaires, 750 m en stock', 'aiguilles 4 mm (laine : 3,5 mm)']],
      ['Snood', ['200 m nécessaires, 750 m en stock']],
    ])
    expect(result.unknown.map((p) => p.id)).toEqual(['Bonnet'])
    // Métrage de la laine inconnu : seules les aiguilles comptent.
    expect(matchPatterns({ ...PARTNER, skeins: null }, [needs('Pull', 900, 3.5)]).fits.map((m) => m.reasons)).toEqual([['aiguilles 3,5 mm (laine : 3,5 mm)']])
  })

  it('compte aussi les patrons déjà tricotés, après les envies', () => {
    expect(matchPatterns(PARTNER, [needs('Tricoté', 300, null, null), needs('Envie', 300, null, 3)]).fits.map((m) => m.item.id)).toEqual(['Envie', 'Tricoté'])
  })
})

describe('patron ajouté par un lien', () => {
  const PDF = new File(['%PDF'], 'gilet.pdf', { type: 'application/pdf' })
  const IMAGE = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
  const link = { url: 'https://p.exemple/gilet', title: 'Gilet Rosée', image: IMAGE, pdf: PDF }

  it('ajoute PDF, photo et nom à un patron vide', () => {
    expect(linkAdditions(link, { title: '', files: NO_FILES })).toEqual({
      title: 'Gilet Rosée',
      pdf: PDF,
      image: IMAGE,
      message: 'PDF du patron ajouté · photo du modèle ajoutée · nom repris de la page.',
    })
  })

  it('ne remplace rien de ce qui est déjà saisi', () => {
    const full = { pdfPath: 'u/p.pdf', newPdf: null, photos: Array.from({ length: 10 }, (_, i) => `u/${i}.jpg`), newPhotos: [] }
    expect(linkAdditions(link, { title: 'Mon gilet', files: full })).toEqual({ title: null, pdf: null, image: null, message: 'PDF trouvé, mais le patron en a déjà un.' })
  })

  it('pas de PDF trouvé : le dit, le lien reste', () => {
    expect(linkAdditions({ ...link, pdf: null, image: null, title: null }, { title: '', files: NO_FILES }).message).toBe(
      'Pas de PDF trouvé (la page demande peut-être une connexion) : le lien est gardé.',
    )
  })

  it('photo de la page illisible : le dit, ajoute le reste', () => {
    expect(linkAdditions({ ...link, image: null }, { title: '', files: NO_FILES }, { imageFailed: true }).message).toBe(
      'PDF du patron ajouté · photo du modèle illisible · nom repris de la page.',
    )
  })

  it('cohérence : ce qui est ajouté reste valable pour l’enregistrement', () => {
    const added = linkAdditions(link, { title: '', files: NO_FILES })
    const files = { ...NO_FILES, newPdf: added.pdf, newPhotos: added.image ? [added.image] : [] }
    expect(parsePatternDraft({ ...EMPTY_PATTERN_DRAFT, title: added.title ?? '', url: link.url }, files)).toHaveProperty('fields')
  })

  it('transforme la réponse de la fonction en fichiers, comme choisis sur le téléphone', async () => {
    const link = patternLinkFromResponse({
      url: 'https://p.exemple/gilet',
      title: 'Gilet',
      image: { data: btoa('img'), type: 'image/png' },
      pdf: { data: btoa('%PDF-1.4'), name: 'gilet.pdf' },
    })
    expect([link.image!.name, link.image!.type, await link.image!.text()]).toEqual(['photo-du-modele.png', 'image/png', 'img'])
    expect([link.pdf!.name, link.pdf!.type, await link.pdf!.text()]).toEqual(['gilet.pdf', 'application/pdf', '%PDF-1.4'])
    expect(patternLinkFromResponse({ url: 'u', title: null, image: { data: '', type: 'image/webp' }, pdf: null }).image!.name).toBe('photo-du-modele.webp')
    expect(patternLinkFromResponse({ url: 'u', title: null, image: { data: '', type: 'image/jpeg' }, pdf: null }).image!.name).toBe('photo-du-modele.jpg')
    expect(patternLinkFromResponse({ url: 'u', title: null, image: null, pdf: null })).toEqual({ url: 'u', title: null, image: null, pdf: null })
  })

  it('ne lit que les liens http(s) complets', () => {
    expect(isReadableLink(' https://p.exemple/gilet ')).toBe(true)
    expect(isReadableLink('http://p.exemple')).toBe(true)
    expect(isReadableLink('p.exemple/gilet')).toBe(false)
    expect(isReadableLink('https://')).toBe(false)
    expect(isReadableLink('')).toBe(false)
  })
})

describe('saisie changée', () => {
  const saved = pattern('g1', { title: 'Gilet', pdfPath: 'u/g.pdf', photos: ['u/1.jpg', 'u/2.jpg'] })
  const draft = toPatternDraft(saved)
  const files: PatternFiles = { pdfPath: 'u/g.pdf', newPdf: null, photos: ['u/1.jpg', 'u/2.jpg'], newPhotos: [] }

  it('rien de touché : pas changée', () => {
    expect(patternFormChanged(draft, { ...draft }, saved, files)).toBe(false)
    expect(patternFormChanged(EMPTY_PATTERN_DRAFT, EMPTY_PATTERN_DRAFT, null, NO_FILES)).toBe(false)
  })

  it('un champ, un fichier ajouté, retiré ou remplacé : changée', () => {
    expect(patternFormChanged(draft, { ...draft, notes: 'x' }, saved, files)).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, newPhotos: [new Blob()] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, photos: ['u/1.jpg'] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, photos: ['u/2.jpg', 'u/1.jpg'] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, pdfPath: null })).toBe(true)
    expect(patternFormChanged(EMPTY_PATTERN_DRAFT, EMPTY_PATTERN_DRAFT, null, WITH_PDF)).toBe(true)
  })
})

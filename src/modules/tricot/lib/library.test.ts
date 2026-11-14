import {
  EMPTY_PATTERN_DRAFT,
  isReadableLink,
  addTag,
  batchFields,
  findDuplicates,
  infoAdditions,
  librarySummary,
  libraryTags,
  movePhoto,
  normalizeTag,
  planBatch,
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
  type PatternInfo,
} from './library'
import type { Yarn } from './yarn'

const NO_FILES: PatternFiles = { pdfPath: null, newPdf: null, photos: [] }
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
    tags: [],
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
      fields: { title: 'Pull', url: null, size: 'M', yarnIdea: '', notes: '', metersNeeded: null, needleMm: null, tags: [] },
    })
    expect(parsePatternDraft({ ...draft, metersNeeded: '350', needleMm: '4,5' }, WITH_PDF)).toMatchObject({ fields: { metersNeeded: 350, needleMm: 4.5 } })
    // Étiquettes : normalisées, sans doublon ; 10 au plus.
    expect(parsePatternDraft({ ...draft, tags: [' Pull ', 'pull', 'Bébé'] }, WITH_PDF)).toMatchObject({ fields: { tags: ['pull', 'bébé'] } })
    expect(parsePatternDraft({ ...draft, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, WITH_PDF)).toEqual({ error: '10 étiquettes au plus.' })
  })

  it('accepte chaque format seul : PDF, photo déjà gardée ou nouvelle, lien', () => {
    expect(parsePatternDraft(draft, { ...NO_FILES, pdfPath: 'u/p.pdf' })).toHaveProperty('fields')
    expect(parsePatternDraft(draft, { ...NO_FILES, photos: ['u/a.jpg'] })).toHaveProperty('fields')
    expect(parsePatternDraft(draft, { ...NO_FILES, photos: [new Blob()] })).toHaveProperty('fields')
    expect(parsePatternDraft({ ...draft, url: 'https://patrons.exemple/pull' }, NO_FILES)).toMatchObject({ fields: { url: 'https://patrons.exemple/pull' } })
  })

  it('donne le premier problème', () => {
    expect(parsePatternDraft(draft, NO_FILES)).toEqual({ error: 'Ajoute le patron : un PDF, des photos ou un lien.' })
    expect(parsePatternDraft({ ...draft, title: ' ' }, WITH_PDF)).toEqual({ error: 'Donne un nom au patron.' })
    expect(parsePatternDraft({ ...draft, title: 'x'.repeat(201) }, WITH_PDF)).toEqual({ error: 'Nom : 200 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, url: 'patrons.exemple' }, NO_FILES)).toEqual({ error: 'Le lien doit commencer par http:// ou https://.' })
    expect(parsePatternDraft({ ...draft, url: `https://${'x'.repeat(2000)}` }, NO_FILES)).toEqual({ error: 'Lien : 2000 caractères au plus.' })
    expect(parsePatternDraft(draft, { ...NO_FILES, photos: [...Array.from({ length: 8 }, (_, i) => `u/${i}.jpg`), new Blob(), new Blob(), new Blob()] })).toEqual({
      error: '10 photos au plus.',
    })
    expect(parsePatternDraft({ ...draft, size: 'x'.repeat(41) }, WITH_PDF)).toEqual({ error: 'Taille : 40 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, yarnIdea: 'x'.repeat(201) }, WITH_PDF)).toEqual({ error: 'Laine envisagée : 200 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, notes: 'x'.repeat(2001) }, WITH_PDF)).toEqual({ error: 'Notes : 2000 caractères au plus.' })
    expect(parsePatternDraft({ ...draft, metersNeeded: '35,5' }, WITH_PDF)).toEqual({ error: 'Métrage : un nombre entier de mètres (1 à 20 000).' })
    expect(parsePatternDraft({ ...draft, needleMm: '50' }, WITH_PDF)).toEqual({ error: 'Aiguilles : entre 1 et 30 mm.' })
  })

  it('cohérence : un patron enregistré, remis en saisie, redonne les mêmes champs', () => {
    const saved = pattern('Gilet', { url: 'https://patrons.exemple/gilet', size: 'M', yarnIdea: 'Mérinos', notes: 'Col V', metersNeeded: 600, needleMm: 3.75, tags: ['gilet', 'bébé'] })
    const parsed = parsePatternDraft(toPatternDraft(saved), NO_FILES)
    expect(parsed).toEqual({ fields: { title: 'Gilet', url: saved.url, size: 'M', yarnIdea: 'Mérinos', notes: 'Col V', metersNeeded: 600, needleMm: 3.75, tags: ['gilet', 'bébé'] } })
    expect(toPatternDraft(saved).needleMm).toBe('3,75')
  })

  it('propose un nom d’après le fichier', () => {
    expect(titleFromFile('pull-bergamote.pdf')).toBe('pull-bergamote')
    expect(titleFromFile('Châle.v2.JPG')).toBe('Châle.v2')
  })
})

describe('liste des patrons', () => {
  it('les plus récents d’abord', () => {
    const items = [pattern('janvier', { createdAt: '2026-01-01' }), pattern('mai', { createdAt: '2026-05-01' }), pattern('mars', { createdAt: '2026-03-01' })]
    expect(sortPatterns(items).map((p) => p.id)).toEqual(['mai', 'mars', 'janvier'])
  })

  it('cherche sans tenir compte des accents ni de la casse, dans le titre, les notes, la laine et les projets', () => {
    const items = [
      pattern('Gilet Rosée', { notes: 'col V' }),
      pattern('Pull', { yarnIdea: 'Mérinos bleu' }),
      pattern('Bonnet', { projects: [{ id: 'p', title: 'Bonnet de Noël', size: 'S' }] }),
    ]
    expect(filterPatterns(items, 'rosee').map((p) => p.id)).toEqual(['Gilet Rosée'])
    expect(filterPatterns(items, 'MERINOS').map((p) => p.id)).toEqual(['Pull'])
    expect(filterPatterns(items, 'noel').map((p) => p.id)).toEqual(['Bonnet'])
    expect(filterPatterns(items, 'gilet col').map((p) => p.id)).toEqual(['Gilet Rosée'])
    expect(filterPatterns(items, 'gilet pull')).toEqual([])
    expect(filterPatterns(items, '  ')).toHaveLength(3)
  })

  it('résume un patron : projets, taille, besoins, laine', () => {
    expect(patternFacts(pattern('Gilet', { size: 'M', metersNeeded: 600, needleMm: 3.5, yarnIdea: 'Mérinos' }))).toEqual(['taille M', '600 m', 'aiguilles 3,5 mm', 'Mérinos'])
    expect(patternFacts(pattern('Pull', { projects: [{ id: '1', title: 'Pull', size: 'M' }, { id: '2', title: 'Pull 2', size: 'L' }] }))).toEqual(['2 projets'])
    expect(patternFacts(pattern('Bonnet'))).toEqual([])
  })

  it('résume la bibliothèque : patrons et ceux déjà tricotés', () => {
    const knitted = { projects: [{ id: '1', title: 'Pull', size: 'M' }] }
    expect(librarySummary([{ projects: [] }])).toBe('1 patron')
    expect(librarySummary([{ projects: [] }, knitted, knitted])).toBe('3 patrons · 2 tricotés')
    expect(librarySummary([knitted])).toBe('1 patron · 1 tricoté')
  })

  it('liste les formats', () => {
    expect(patternFormats({ pdfPath: 'u/p.pdf', photos: ['a', 'b'], url: 'https://x' })).toEqual(['PDF', '2 photos', 'lien'])
    expect(patternFormats({ pdfPath: null, photos: ['a'], url: null })).toEqual(['1 photo'])
  })
})

describe('quel patron pour ma laine', () => {
  const PARTNER: Yarn = { brand: 'Phildar', name: 'Partner 3.5', color: null, dye_lot: null, composition: null, weight_g: 50, length_m: 125, skeins: 6, needle_mm: 3.5 }
  const needs = (id: string, metersNeeded: number | null, needleMm: number | null) => pattern(id, { metersNeeded, needleMm })

  it('garde les patrons dont le métrage et les aiguilles conviennent, met à part ceux qu’on ne peut pas juger', () => {
    // 6 pelotes de 125 m (750 m), aiguilles 3,5 mm.
    const result = matchPatterns(PARTNER, [needs('Pull', 900, 3.5), needs('Gilet', 600, 4), needs('Châle', 400, 6), needs('Bonnet', null, null), needs('Snood', 200, null)])
    expect(result.fits.map((m) => [m.item.id, m.reasons])).toEqual([
      ['Gilet', ['600 m nécessaires, 750 m en stock', 'aiguilles 4 mm (laine : 3,5 mm)']],
      ['Snood', ['200 m nécessaires, 750 m en stock']],
    ])
    expect(result.unknown.map((p) => p.id)).toEqual(['Bonnet'])
    // Métrage de la laine inconnu : seules les aiguilles comptent.
    expect(matchPatterns({ ...PARTNER, skeins: null }, [needs('Pull', 900, 3.5)]).fits.map((m) => m.reasons)).toEqual([['aiguilles 3,5 mm (laine : 3,5 mm)']])
  })

  it('compte aussi les patrons déjà tricotés', () => {
    const knitted = pattern('Tricoté', { metersNeeded: 300, projects: [{ id: 'p', title: 'Tricoté', size: 'M' }] })
    expect(matchPatterns(PARTNER, [knitted, needs('Pas encore', 300, null)]).fits.map((m) => m.item.id)).toEqual(['Tricoté', 'Pas encore'])
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
    const full = { pdfPath: 'u/p.pdf', newPdf: null, photos: Array.from({ length: 10 }, (_, i) => `u/${i}.jpg`) }
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
    const files = { ...NO_FILES, newPdf: added.pdf, photos: added.image ? [added.image] : [] }
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
  const files: PatternFiles = { pdfPath: 'u/g.pdf', newPdf: null, photos: ['u/1.jpg', 'u/2.jpg'] }

  it('rien de touché : pas changée', () => {
    expect(patternFormChanged(draft, { ...draft }, saved, files)).toBe(false)
    expect(patternFormChanged(EMPTY_PATTERN_DRAFT, EMPTY_PATTERN_DRAFT, null, NO_FILES)).toBe(false)
  })

  it('un champ, un fichier ajouté, retiré ou remplacé : changée', () => {
    expect(patternFormChanged(draft, { ...draft, notes: 'x' }, saved, files)).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, photos: [...files.photos, new Blob()] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, photos: ['u/1.jpg'] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, photos: ['u/2.jpg', 'u/1.jpg'] })).toBe(true)
    expect(patternFormChanged(draft, draft, saved, { ...files, pdfPath: null })).toBe(true)
    expect(patternFormChanged(EMPTY_PATTERN_DRAFT, EMPTY_PATTERN_DRAFT, null, WITH_PDF)).toBe(true)
  })
})

describe('étiquettes', () => {
  it('normalise : espaces resserrés, minuscules, 30 caractères', () => {
    expect(normalizeTag('  Pull   Homme ')).toBe('pull homme')
    expect(normalizeTag('x'.repeat(40))).toHaveLength(30)
  })

  it('ajoute sans doublon ni vide, 10 au plus', () => {
    expect(addTag(['pull'], ' Bébé ')).toEqual(['pull', 'bébé'])
    const tags = ['pull']
    expect(addTag(tags, 'PULL')).toBe(tags)
    expect(addTag(tags, '  ')).toBe(tags)
    const full = Array.from({ length: 10 }, (_, i) => `t${i}`)
    expect(addTag(full, 'encore')).toBe(full)
  })

  it('propose les étiquettes de la bibliothèque, les plus employées d’abord', () => {
    expect(libraryTags([{ tags: ['pull', 'bébé'] }, { tags: ['bonnet', 'bébé'] }, { tags: [] }])).toEqual(['bébé', 'bonnet', 'pull'])
  })

  it('filtre par étiquette, et la recherche les trouve aussi', () => {
    const items = [pattern('a', { tags: ['pull'] }), pattern('b', { tags: ['bonnet'] }), pattern('c')]
    expect(filterPatterns(items, '', 'pull').map((p) => p.id)).toEqual(['a'])
    expect(filterPatterns(items, 'bonn').map((p) => p.id)).toEqual(['b'])
    expect(filterPatterns(items, 'a', 'bonnet')).toEqual([])
  })
})

describe('ordre des photos', () => {
  it('déplace une photo ; la première est la couverture', () => {
    expect(movePhoto(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(movePhoto(['a', 'b', 'c'], 1, 0)).toEqual(['b', 'a', 'c'])
    const same = ['a', 'b']
    expect(movePhoto(same, 0, 0)).toBe(same)
    expect(movePhoto(same, 5, 0)).toBe(same)
  })

  it('cohérence : déplacer garde toutes les photos', () => {
    const photos = ['a', 'b', 'c', 'd']
    for (let from = 0; from < 4; from++) for (let to = 0; to < 4; to++) expect(movePhoto(photos, from, to).toSorted()).toEqual(photos)
  })
})

describe('doublons', () => {
  const items = [pattern('g1', { title: 'Gilet Rosée', url: 'https://www.patrons.exemple/gilet/' }), pattern('b1', { title: 'Bonnet' })]

  it('même nom (sans accents, casse ni ponctuation) ou même lien', () => {
    expect(findDuplicates(items, { title: 'gilet-rosee', url: null }).map((p) => p.id)).toEqual(['g1'])
    expect(findDuplicates(items, { title: 'Autre', url: 'http://patrons.exemple/gilet#haut' }).map((p) => p.id)).toEqual(['g1'])
    expect(findDuplicates(items, { title: 'Bonnet rayé', url: 'https://patrons.exemple/bonnet' })).toEqual([])
    expect(findDuplicates(items, { title: ' ', url: null })).toEqual([])
  })

  it('le patron modifié ne se signale pas lui-même', () => {
    expect(findDuplicates(items, { title: 'Gilet Rosée', url: null }, 'g1')).toEqual([])
  })
})

describe('remplir avec l’IA', () => {
  const INFO: PatternInfo = { title: 'Pull Bergamote', sizes: ['S', 'M', 'L'], meters: [900, 1000, 1100], needleMm: 3.5, yarn: 'DROPS Alpaca', kind: 'pull' }

  it('remplit les champs vides, le métrage de la taille visée', () => {
    const { patch, message } = infoAdditions(INFO, { ...EMPTY_PATTERN_DRAFT, size: 'm' })
    expect(patch).toEqual({ title: 'Pull Bergamote', metersNeeded: '1000', needleMm: '3,5', yarnIdea: 'DROPS Alpaca', tags: ['pull'] })
    expect(message).toBe('Rempli : nom, métrage, aiguilles, laine, étiquette « pull » · tailles du patron : S, M, L.')
  })

  it('ne remplace rien de ce qui est saisi', () => {
    const draft = { ...EMPTY_PATTERN_DRAFT, title: 'Mon pull', size: 'M', metersNeeded: '950', needleMm: '4', yarnIdea: 'Mérinos', tags: ['pull'] }
    expect(infoAdditions(INFO, draft)).toEqual({ patch: {}, message: 'Rien de nouveau : la fiche était déjà remplie · tailles du patron : S, M, L.' })
  })

  it('plusieurs tailles sans taille visée : demande la taille pour le métrage', () => {
    const { patch, message } = infoAdditions(INFO, EMPTY_PATTERN_DRAFT)
    expect(patch.metersNeeded).toBeUndefined()
    expect(message).toContain('métrage selon la taille : indique la taille visée et relance')
  })

  it('taille unique : son métrage, sans taille visée', () => {
    expect(infoAdditions({ ...INFO, sizes: [], meters: [300] }, EMPTY_PATTERN_DRAFT).patch.metersNeeded).toBe('300')
  })

  it('cohérence : ce qui est rempli reste valable pour l’enregistrement', () => {
    const { patch } = infoAdditions(INFO, { ...EMPTY_PATTERN_DRAFT, size: 'L' })
    expect(parsePatternDraft({ ...EMPTY_PATTERN_DRAFT, size: 'L', ...patch }, WITH_PDF)).toMatchObject({ fields: { metersNeeded: 1100, needleMm: 3.5, tags: ['pull'] } })
  })
})

describe('ajout groupé', () => {
  const library = [pattern('g1', { title: 'Gilet Rosée' })]

  it('un patron par PDF, nommé d’après le fichier ; trop lourds et doublons sautés', () => {
    const files = [
      { name: 'Pull Bergamote.pdf', size: 1000 },
      { name: 'gilet-rosee.pdf', size: 1000 },
      { name: 'Énorme.pdf', size: 30_000_000 },
      { name: 'pull bergamote.PDF', size: 1000 },
    ]
    expect(planBatch(files, library, 20_000_000)).toEqual([
      { title: 'Pull Bergamote', skip: null },
      { title: 'gilet-rosee', skip: 'duplicate' },
      { title: 'Énorme', skip: 'too-large' },
      { title: 'pull bergamote', skip: 'duplicate' },
    ])
  })

  it('cohérence : chaque patron prévu s’enregistre', () => {
    for (const item of planBatch([{ name: 'Châle.pdf', size: 10 }, { name: '.pdf', size: 10 }], [], 100)) {
      expect(parsePatternDraft({ ...EMPTY_PATTERN_DRAFT, title: batchFields(item.title).title }, WITH_PDF)).toHaveProperty('fields')
    }
  })
})

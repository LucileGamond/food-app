import {
  adjustCount,
  describeYarn,
  matchPatterns,
  parseMeters,
  patternSearchUrl,
  siteOf,
  yarnMeters,
  EMPTY_YARN,
  formatGauge,
  gaugeDiffers,
  parseGauge,
  parseQueueDraft,
  parseYarn,
  sortQueue,
  toYarnDraft,
  totalLength,
  yarnDetails,
  yarnsFromJson,
  yarnTitle,
  type QueuedPattern,
  type Yarn,
} from './yarn'

const PARTNER: Yarn = { brand: 'Phildar', name: 'Partner 3.5', color: '0012 Ciel', dye_lot: '4471', composition: '50 % laine', weight_g: 50, length_m: 125, skeins: 6, needle_mm: 3.5 }

describe('laine', () => {
  it('passe d’une laine à sa saisie et retour', () => {
    const draft = toYarnDraft(PARTNER)
    expect(draft).toMatchObject({ brand: 'Phildar', weight_g: '50', needle_mm: '3,5', skeins: '6' })
    expect(parseYarn(draft)).toEqual({ yarn: PARTNER })
    expect(parseYarn({ ...toYarnDraft(EMPTY_YARN), skeins: '2,5', name: '  Alpaga ' })).toEqual({ yarn: { ...EMPTY_YARN, name: 'Alpaga', skeins: 2.5 } })
  })

  it('refuse une saisie vide ou hors bornes', () => {
    const empty = toYarnDraft(EMPTY_YARN)
    expect(parseYarn(empty)).toEqual({ error: 'Remplis au moins un champ.' })
    expect(parseYarn({ ...empty, weight_g: '50,5' })).toEqual({ error: 'Poids : un nombre entier de grammes (1 à 1000).' })
    expect(parseYarn({ ...empty, length_m: 'beaucoup' })).toEqual({ error: 'Métrage : un nombre entier de mètres (1 à 5000).' })
    expect(parseYarn({ ...empty, skeins: '2,3' })).toEqual({ error: 'Pelotes : un nombre, par demi (0 à 200).' })
    expect(parseYarn({ ...empty, needle_mm: '40' })).toEqual({ error: 'Aiguilles : entre 1 et 30 mm.' })
    expect(parseYarn({ ...empty, brand: 'x'.repeat(81) })).toEqual({ error: '80 caractères au plus par champ.' })
  })

  it('lit les laines de la base sans planter sur une valeur inattendue', () => {
    expect(yarnsFromJson([PARTNER, 'abîmé', null, { brand: 3, skeins: '2' }])).toEqual([PARTNER, EMPTY_YARN])
    expect(yarnsFromJson(null)).toEqual([])
  })

  it('décrit la laine et le métrage total', () => {
    expect(yarnTitle(PARTNER)).toBe('Phildar Partner 3.5')
    expect(yarnTitle(EMPTY_YARN)).toBe('Laine')
    expect(yarnDetails(PARTNER)).toBe('coloris 0012 Ciel · bain 4471 · 50 % laine · 50 g / 125 m · 6 pelotes · aiguilles 3,5 mm')
    expect(yarnDetails({ ...EMPTY_YARN, length_m: 200, skeins: 1 })).toBe('200 m · 1 pelote')
    expect(totalLength([PARTNER, { ...PARTNER, skeins: 0.5, length_m: 101 }, { ...EMPTY_YARN, skeins: 3 }])).toBe(801)
    expect(totalLength([EMPTY_YARN])).toBeNull()
  })
})

describe('échantillon', () => {
  it('lit un échantillon pour 10 cm', () => {
    expect(parseGauge('22')).toBe(22)
    expect(parseGauge('22,45')).toBe(22.5)
    expect(parseGauge('')).toBeNull()
    expect(parseGauge('0')).toBeUndefined()
    expect(parseGauge('abc')).toBeUndefined()
  })

  it('recalcule mailles et rangs pour l’échantillon de la tricoteuse', () => {
    // Plus serré (24 m. au lieu de 22) : plus de mailles pour la même largeur.
    expect(adjustCount(64, 22, 24)).toBe(70)
    expect(adjustCount(30, 30, 27)).toBe(27)
    expect(adjustCount(64, 22, 22)).toBeNull()
    expect(adjustCount(64, null, 24)).toBeNull()
    expect(adjustCount(null, 22, 24)).toBeNull()
    expect(adjustCount(1, 30, 1)).toBe(1)
    expect(gaugeDiffers({ stitches: 22, rows: 30 }, { stitches: 22, rows: 28 })).toBe(true)
    expect(gaugeDiffers({ stitches: 22, rows: 30 }, { stitches: null, rows: null })).toBe(false)
    expect(formatGauge({ stitches: 22, rows: 30.5 })).toBe('22 m. × 30,5 rangs pour 10 cm')
    expect(formatGauge({ stitches: null, rows: null })).toBeNull()
  })
})

describe('patrons à faire plus tard', () => {
  const draft = { title: ' Pull ', url: '', size: ' M ', yarnIdea: '', notes: '', priority: 2 as const, metersNeeded: '', needleMm: '' }
  const pdf = new File(['%PDF'], 'pull.pdf', { type: 'application/pdf' })

  it('exige un nom et un PDF ou un lien valide', () => {
    expect(parseQueueDraft(draft, pdf)).toEqual({ input: { title: 'Pull', pdf, url: null, size: 'M', yarnIdea: '', notes: '', priority: 2, metersNeeded: null, needleMm: null } })
    expect(parseQueueDraft({ ...draft, metersNeeded: '350', needleMm: '4,5' }, pdf)).toMatchObject({ input: { metersNeeded: 350, needleMm: 4.5 } })
    expect(parseQueueDraft({ ...draft, metersNeeded: '35,5' }, pdf)).toEqual({ error: 'Métrage : un nombre entier de mètres (1 à 20 000).' })
    expect(parseQueueDraft({ ...draft, needleMm: '50' }, pdf)).toEqual({ error: 'Aiguilles : entre 1 et 30 mm.' })
    expect(parseQueueDraft({ ...draft, url: 'https://patrons.exemple/pull' }, null)).toMatchObject({ input: { url: 'https://patrons.exemple/pull', pdf: null } })
    expect(parseQueueDraft({ ...draft, title: ' ' }, pdf)).toEqual({ error: 'Donne un nom au patron.' })
    expect(parseQueueDraft(draft, null)).toEqual({ error: 'Ajoute le PDF du patron ou un lien.' })
    expect(parseQueueDraft({ ...draft, url: 'patrons.exemple' }, null)).toEqual({ error: 'Le lien doit commencer par http:// ou https://.' })
    expect(parseQueueDraft({ ...draft, size: 'x'.repeat(41) }, pdf)).toEqual({ error: 'Taille : 40 caractères au plus.' })
    expect(parseQueueDraft({ ...draft, title: 'x'.repeat(201) }, pdf)).toEqual({ error: 'Nom : 200 caractères au plus.' })
    expect(parseQueueDraft({ ...draft, yarnIdea: 'x'.repeat(201) }, pdf)).toEqual({ error: 'Laine envisagée : 200 caractères au plus.' })
    expect(parseQueueDraft({ ...draft, notes: 'x'.repeat(2001) }, pdf)).toEqual({ error: 'Notes : 2000 caractères au plus.' })
  })

  it('les plus pressés d’abord, puis les plus anciens', () => {
    const item = (id: string, priority: 1 | 2 | 3, createdAt: string): QueuedPattern => ({ id, title: id, pdfPath: null, url: null, size: null, yarnIdea: '', notes: '', priority, createdAt, metersNeeded: null, needleMm: null })
    expect(sortQueue([item('c', 3, '2026-01-01'), item('b', 1, '2026-03-01'), item('a', 1, '2026-02-01')]).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('quel patron pour ma laine', () => {
  const queued = (id: string, metersNeeded: number | null, needleMm: number | null, priority: 1 | 2 | 3 = 2): QueuedPattern => ({
    id,
    title: id,
    pdfPath: null,
    url: null,
    size: null,
    yarnIdea: '',
    notes: '',
    priority,
    createdAt: '2026-11-01',
    metersNeeded,
    needleMm,
  })

  it('garde les patrons dont le métrage et les aiguilles conviennent, met à part ceux qu’on ne peut pas juger', () => {
    // 6 pelotes de 125 m (750 m), aiguilles 3,5 mm.
    const result = matchPatterns(PARTNER, [queued('Pull', 900, 3.5), queued('Gilet', 600, 4, 1), queued('Châle', 400, 6), queued('Bonnet', null, null), queued('Snood', 200, null)])
    expect(result.fits.map((m) => [m.item.id, m.reasons])).toEqual([
      ['Gilet', ['600 m nécessaires, 750 m en stock', 'aiguilles 4 mm (laine : 3,5 mm)']],
      ['Snood', ['200 m nécessaires, 750 m en stock']],
    ])
    expect(result.unknown.map((p) => p.id)).toEqual(['Bonnet'])
    // Métrage de la laine inconnu : seules les aiguilles comptent.
    expect(matchPatterns({ ...PARTNER, skeins: null }, [queued('Pull', 900, 3.5)]).fits.map((m) => m.reasons)).toEqual([['aiguilles 3,5 mm (laine : 3,5 mm)']])
  })

  it('décrit la laine, le métrage disponible et la recherche de patrons', () => {
    expect(yarnMeters(PARTNER)).toBe(750)
    expect(yarnMeters({ ...PARTNER, length_m: null })).toBeNull()
    expect(describeYarn(PARTNER)).toBe('Phildar Partner 3.5, coloris 0012 Ciel · bain 4471 · 50 % laine · 50 g / 125 m · aiguilles 3,5 mm')
    expect(patternSearchUrl('ribbed beanie')).toBe('https://www.ravelry.com/patterns/search#craft=knitting&query=ribbed%20beanie')
    expect(patternSearchUrl('cabled cowl', { weight: 'dk' })).toBe('https://www.ravelry.com/patterns/search#craft=knitting&weight=dk&query=cabled%20cowl')
    // Métrage disponible en yards, aiguilles Ravelry à 0,5 mm près
    expect(patternSearchUrl('hat', { meters: 750, needleMm: 3.5 })).toBe(
      'https://www.ravelry.com/patterns/search#craft=knitting&yardage=0%7C820&needles=3.0mm%7C3.25mm%7C3.5mm%7C3.75mm%7C4.0mm&query=hat',
    )
    expect(patternSearchUrl('hat', { meters: 0, needleMm: 40 })).toBe('https://www.ravelry.com/patterns/search#craft=knitting&query=hat')
    expect(siteOf('https://www.garnstudio.com/pattern.php?id=1')).toBe('garnstudio.com')
    expect(siteOf('pas une adresse')).toBe('pas une adresse')
    expect(parseMeters('350')).toBe(350)
    expect(parseMeters('')).toBeNull()
    expect(parseMeters('0')).toBeUndefined()
  })
})

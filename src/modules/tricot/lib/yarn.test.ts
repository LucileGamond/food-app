import {
  adjustCount,
  describeYarn,
  parseMeters,
  patternSearchUrl,
  siteOf,
  yarnMeters,
  EMPTY_YARN,
  formatGauge,
  gaugeDiffers,
  parseGauge,
  parseYarn,
  toYarnDraft,
  totalLength,
  yarnDetails,
  yarnsFromJson,
  yarnTitle,
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

describe('quel patron pour ma laine', () => {
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

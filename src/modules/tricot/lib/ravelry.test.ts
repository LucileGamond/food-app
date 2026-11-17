import { hasList, hasObject, hasText, isRavelryImport, patternSearchUrl, ravelryYarnDetails } from './ravelry'

describe('réponses de la fonction (Ravelry)', () => {
  it('champ texte, liste, objet', () => {
    expect(hasText('url')({ url: 'https://x' })).toBe(true)
    expect(hasText('url')({ url: 3 })).toBe(false)
    expect(hasList('yarns')({ yarns: [] })).toBe(true)
    expect(hasList('yarns')({ yarns: {} })).toBe(false)
    expect(hasObject('yarn')({ yarn: {} })).toBe(true)
    expect(hasObject('yarn')({ yarn: null })).toBe(false)
    expect(hasObject('yarn')({})).toBe(false)
  })

  it('patron importé : adresse, nom et infos', () => {
    expect(isRavelryImport({ url: 'u', title: 't', ravelry: {} })).toBe(true)
    expect(isRavelryImport({ url: 'u', title: null, ravelry: {} })).toBe(false)
    expect(isRavelryImport({ url: 'u', title: 't', ravelry: null })).toBe(false)
    expect(isRavelryImport({ title: 't', ravelry: {} })).toBe(false)
  })
})

describe('recherche sur Ravelry', () => {
  it('adresse de recherche de patrons : tricot, grosseur, métrage en yards, aiguilles à 0,5 mm près', () => {
    expect(patternSearchUrl('ribbed beanie')).toBe('https://www.ravelry.com/patterns/search#craft=knitting&query=ribbed%20beanie')
    expect(patternSearchUrl('cabled cowl', { weight: 'dk' })).toBe('https://www.ravelry.com/patterns/search#craft=knitting&weight=dk&query=cabled%20cowl')
    // Métrage disponible en yards, aiguilles Ravelry à 0,5 mm près
    expect(patternSearchUrl('hat', { meters: 750, needleMm: 3.5 })).toBe(
      'https://www.ravelry.com/patterns/search#craft=knitting&yardage=0%7C820&needles=3.0mm%7C3.25mm%7C3.5mm%7C3.75mm%7C4.0mm&query=hat',
    )
    expect(patternSearchUrl('hat', { meters: 0, needleMm: 40 })).toBe('https://www.ravelry.com/patterns/search#craft=knitting&query=hat')
  })

  it('aperçu d’une laine trouvée', () => {
    expect(ravelryYarnDetails({ id: 1, brand: 'Garnstudio', name: 'Merino', weightG: 50, lengthM: 105, category: 'DK' })).toBe('Garnstudio · 50 g / 105 m · DK')
    expect(ravelryYarnDetails({ id: 1, brand: null, name: 'Merino', weightG: null, lengthM: null, category: null })).toBe('')
  })
})

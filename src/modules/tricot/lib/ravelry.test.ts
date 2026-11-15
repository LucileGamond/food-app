import { hasList, hasObject, hasText, isRavelryImport } from './ravelry'

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

import { asRecord, str, trimmedText } from './sanitize.ts'

describe('lecture prudente', () => {
  it('texte nettoyé et borné', () => {
    expect(str('  Tarte   aux\npommes ', 20)).toBe('Tarte aux pommes')
    expect(str('abcdef', 3)).toBe('abc')
    expect(str(42, 10)).toBe('')
  })

  it('texte sans espaces autour, lignes gardées, borné', () => {
    expect(trimmedText('  Rang 1 : endroit\nRang 2 : envers  ', 100)).toBe('Rang 1 : endroit\nRang 2 : envers')
    expect(trimmedText('abcdef', 3)).toBe('abc')
    expect(trimmedText(null, 10)).toBe('')
  })

  it('objet, sinon objet vide', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord(null)).toEqual({})
    expect(asRecord('x')).toEqual({})
  })
})

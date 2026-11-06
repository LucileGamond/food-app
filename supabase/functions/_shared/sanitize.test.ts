import { asRecord, str } from './sanitize.ts'

describe('lecture prudente', () => {
  it('texte nettoyé et borné', () => {
    expect(str('  Tarte   aux\npommes ', 20)).toBe('Tarte aux pommes')
    expect(str('abcdef', 3)).toBe('abc')
    expect(str(42, 10)).toBe('')
  })

  it('objet, sinon objet vide', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord(null)).toEqual({})
    expect(asRecord('x')).toEqual({})
  })
})

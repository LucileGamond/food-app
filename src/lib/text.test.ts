import { capitalize, decimal, foldText, plural } from './text'

describe('foldText', () => {
  it('compare sans casse, accents ni ligatures, espaces simplifiés', () => {
    expect(foldText('  Œufs   FRAIS ')).toBe('oeufs frais')
    expect(foldText('Crème brûlée')).toBe('creme brulee')
    expect(foldText('ex æquo')).toBe('ex aequo')
    expect(foldText('oeuf')).toBe(foldText('Œuf'))
  })
})

describe('capitalize', () => {
  it('met la première lettre en majuscule, accent compris', () => {
    expect(capitalize('oignon')).toBe('Oignon')
    expect(capitalize('écrasé')).toBe('Écrasé')
    expect(capitalize('')).toBe('')
  })
})

describe('plural', () => {
  it('singulier jusqu’à 1, pluriel au-delà', () => {
    expect([0, 1, 2].map((n) => plural(n, 'rang'))).toEqual(['0 rang', '1 rang', '2 rangs'])
  })
})

describe('decimal', () => {
  it('virgule décimale à la française', () => {
    expect([3.5, 4, 0.25].map(decimal)).toEqual(['3,5', '4', '0,25'])
  })
})

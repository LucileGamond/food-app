import { capitalize, foldText } from './text'

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

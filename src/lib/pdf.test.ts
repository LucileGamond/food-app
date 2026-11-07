import { renderScale } from './pdf'

describe('renderScale', () => {
  it('met le côté long de la page à la taille voulue', () => {
    expect(renderScale({ width: 595, height: 842 }, 2400)).toBeCloseTo(2400 / 842)
    expect(renderScale({ width: 842, height: 595 }, 360)).toBeCloseTo(360 / 842)
  })

  it('borne l’échelle pour une page minuscule, géante ou vide', () => {
    expect(renderScale({ width: 10, height: 10 }, 2400)).toBe(8)
    expect(renderScale({ width: 100_000, height: 100_000 }, 360)).toBe(0.1)
    expect(renderScale({ width: 0, height: 0 }, 360)).toBe(1)
  })
})

import { hexToHsl, shade } from './color'

describe('couleurs', () => {
  it('éclaircit ou fonce une couleur sans sortir des bornes', () => {
    expect(hexToHsl('#ff0000')).toEqual([0, 100, 50])
    expect(hexToHsl('#808080')).toEqual([0, 0, 50])
    expect(hexToHsl('#3f4fa0')).toEqual([230, 43, 44])
    expect(shade('#3f4fa0', -30)).toBe('hsl(230 43% 14%)')
    expect(shade('#ffffff', 20)).toBe('hsl(0 0% 92%)')
    expect(shade('#000000', -20)).toBe('hsl(0 0% 6%)')
  })
})

import { ballScale, ballWraps, DEFAULT_HUE, gaugeFraction, gaugeHues, hexToHsl, plySegments, random, seedOf, shade, threadCenter } from './yarnGauge'

const LINE = { x0: 40, x1: 312, y: 50, amp: 9, waves: 2.5, width: 9 }

describe('jauge pelote et fil', () => {
  it('prend les couleurs de la laine, sinon l’indigo du module', () => {
    expect(gaugeHues([])).toEqual([DEFAULT_HUE])
    expect(gaugeHues(['#d0563a', '#e8a33a'])).toEqual(['#d0563a', '#e8a33a'])
  })

  it('éclaircit ou fonce une couleur sans sortir des bornes', () => {
    expect(hexToHsl('#ff0000')).toEqual([0, 100, 50])
    expect(hexToHsl('#808080')).toEqual([0, 0, 50])
    expect(hexToHsl('#3f4fa0')).toEqual([230, 43, 44])
    expect(shade('#3f4fa0', -30)).toBe('hsl(230 43% 14%)')
    expect(shade('#ffffff', 20)).toBe('hsl(0 0% 92%)')
    expect(shade('#000000', -20)).toBe('hsl(0 0% 6%)')
  })

  it('donne à chaque projet sa pelote, toujours enroulée pareil', () => {
    expect(seedOf('p1')).toBe(seedOf('p1'))
    expect(seedOf('p1')).not.toBe(seedOf('p2'))
    expect(seedOf('')).toBeGreaterThan(0)
    const a = random(42)
    const b = random(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(ballWraps(7, 30, [], 34)).toEqual(ballWraps(7, 30, [], 34))
    expect(ballWraps(7, 30, [], 34)).not.toEqual(ballWraps(8, 30, [], 34))
    // Centrée ailleurs : même enroulement, décalé.
    const [w1] = ballWraps(7, 30, [], 1)
    const [w2] = ballWraps(7, 30, [], 1, 50, 40)
    const start = (d: string) => d.slice(1).split('A')[0]!.split(' ').map(Number)
    expect(start(w2!.d)[0]).toBeCloseTo(start(w1!.d)[0]! + 50, 1)
    expect(start(w2!.d)[1]).toBeCloseTo(start(w1!.d)[1]! + 40, 1)
  })

  it('enroule la pelote irrégulièrement, dans les couleurs de la laine', () => {
    const wraps = ballWraps(seedOf('p1'), 30, ['#d0563a', '#e8a33a', '#7a3f8f'], 34)
    expect(wraps).toHaveLength(34)
    expect(new Set(wraps.map((w) => w.rotate)).size).toBeGreaterThan(30)
    // Les trois couleurs sont utilisées (teintes 11°, 36° et 285° environ).
    const hues = new Set(wraps.map((w) => Number(/^hsl\((\d+)/.exec(w.color)![1])))
    expect([...hues].some((h) => h < 20) && [...hues].some((h) => h > 25 && h < 50) && [...hues].some((h) => h > 270)).toBe(true)
    for (const w of wraps) {
      expect(w.d).toMatch(/^M-?[\d.]+ -?[\d.]+A[\d.]+ [\d.]+ [\d.]+ 0 [01] -?[\d.]+ -?[\d.]+$/)
      // Rotation dans le tracé : les extrémités du tour restent sur le bord de la pelote.
      const [x, y] = w.d.slice(1).split('A')[0]!.split(' ').map(Number)
      expect(Math.hypot(x!, y!)).toBeLessThanOrEqual(30 * 1.05)
      expect(w.width).toBeGreaterThan(0)
    }
  })

  it('trace le fil de la pelote jusqu’au bout, en vagues', () => {
    const pts = threadCenter(LINE).split(' ').map((p) => p.split(',').map(Number))
    expect(pts[0]).toEqual([40, 50])
    expect(pts.at(-1)![0]).toBe(312)
    expect(Math.max(...pts.map((p) => p[1]!))).toBeCloseTo(59, 0)
    expect(Math.min(...pts.map((p) => p[1]!))).toBeCloseTo(41, 0)
  })

  it('tord trois brins, alternativement devant et derrière', () => {
    const segs = plySegments(LINE)
    expect(new Set(segs.map((s) => s.ply))).toEqual(new Set([0, 1, 2]))
    expect(segs.some((s) => s.front) && segs.some((s) => !s.front)).toBe(true)
    // Un morceau par demi-tour de brin : beaucoup de croisements le long du fil.
    expect(segs.length).toBeGreaterThan(60)
    // Les brins restent autour du fil (à moins d'une demi-épaisseur).
    for (const s of segs.slice(0, 10)) for (const p of s.points.split(' ')) expect(Number(p.split(',')[1])).toBeLessThan(50 + 9 + 4)
  })

  it('fait rapetisser la pelote avec les rangs tricotés', () => {
    expect(gaugeFraction(0, 80)).toBe(0)
    expect(gaugeFraction(20, 80)).toBe(0.25)
    expect(gaugeFraction(90, 80)).toBe(1)
    expect(gaugeFraction(3, 0)).toBe(0)
    expect(ballScale(0)).toBe(1)
    expect(ballScale(1)).toBeCloseTo(0.45)
  })
})

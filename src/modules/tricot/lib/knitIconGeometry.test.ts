import { arc, cubic, join, line, plyAlong, toPoints } from './knitIconGeometry'

describe('géométrie des icônes illustrées', () => {
  it('trace courbes, segments et arcs de bout en bout', () => {
    const c = cubic([0, 0], [10, 0], [10, 10], [20, 10], 10)
    expect(c[0]).toEqual([0, 0])
    expect(c.at(-1)).toEqual([20, 10])
    expect(c).toHaveLength(11)
    const l = line([0, 0], [10, 0])
    expect(l[0]).toEqual([0, 0])
    expect(l.at(-1)).toEqual([10, 0])
    expect(l.length).toBeGreaterThan(3)
    const a = arc(0, 0, 10, 0, 90, 4)
    expect(a[0]![0]).toBeCloseTo(10)
    expect(a.at(-1)![1]).toBeCloseTo(10)
  })

  it('met les morceaux bout à bout sans répéter la jonction', () => {
    expect(join([[0, 0], [1, 1]], [[1, 1], [2, 2]])).toEqual([[0, 0], [1, 1], [2, 2]])
    expect(toPoints([[1, 2], [3.456, 4]])).toBe('1.00,2.00 3.46,4.00')
  })

  it('tord trois brins le long du tracé, devant et derrière', () => {
    const pieces = plyAlong(line([0, 32], [60, 32]), 6)
    expect(new Set(pieces.map((p) => p.ply))).toEqual(new Set([0, 1, 2]))
    expect(pieces.some((p) => p.front) && pieces.some((p) => !p.front)).toBe(true)
    // Les brins restent dans l'épaisseur du fil.
    for (const p of pieces) for (const pt of p.points.split(' ')) expect(Math.abs(Number(pt.split(',')[1]) - 32)).toBeLessThanOrEqual(6 * 0.34 + 0.01)
  })
})

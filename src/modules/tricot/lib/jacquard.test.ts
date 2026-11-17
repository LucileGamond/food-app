import { jacquard, JACQUARD_BASE, JACQUARD_SIZE, MOTIFS } from './jacquard'
import { seedOf } from './random'

describe('couverture tissée', () => {
  it('donne à chaque patron son jacquard, toujours le même', () => {
    expect(jacquard(seedOf('a'))).toEqual(jacquard(seedOf('a')))
    const all = Array.from({ length: 40 }, (_, i) => jacquard(seedOf(`patron-${i}`)))
    // Plusieurs motifs et plusieurs teintes d'un patron à l'autre.
    expect(new Set(all.map((j) => j.motif)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(all.map((j) => j.colors[1])).size).toBeGreaterThanOrEqual(4)
  })

  it('fond écru et deux teintes différentes, sur 8 mailles × 8 rangs', () => {
    for (let i = 0; i < 20; i++) {
      const j = jacquard(seedOf(`p${i}`))
      expect(j.colors[0]).toBe(JACQUARD_BASE)
      expect(j.colors[1]).not.toBe(j.colors[2])
      expect(j.rows).toHaveLength(JACQUARD_SIZE)
      expect(j.rows.every((r) => r.length === JACQUARD_SIZE)).toBe(true)
    }
  })

  it('dessine des motifs qui se voient (fond et motif mêlés)', () => {
    for (const [name, draw] of Object.entries(MOTIFS)) {
      const cells = Array.from({ length: 64 }, (_, i) => draw(i % 8, Math.floor(i / 8)))
      const motif = cells.filter((c) => c > 0).length
      expect(motif, name).toBeGreaterThan(4)
      expect(motif, name).toBeLessThan(60)
    }
  })
})

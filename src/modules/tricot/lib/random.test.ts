import { random, seedOf } from './random'

describe('tirages reproductibles', () => {
  it('même identifiant, même graine ; même graine, mêmes tirages', () => {
    expect(seedOf('p1')).toBe(seedOf('p1'))
    expect(seedOf('p1')).not.toBe(seedOf('p2'))
    expect(seedOf('')).toBeGreaterThan(0)
    const a = random(42)
    const b = random(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(random(1)()).not.toBe(random(2)())
    for (let i = 0, r = random(7); i < 100; i++) expect(r()).toBeGreaterThanOrEqual(0)
  })
})

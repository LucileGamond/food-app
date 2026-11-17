import { render, screen } from '@testing-library/react'
import { jacquard } from '../lib/jacquard'
import { seedOf } from '../lib/random'
import { KnitCover } from './KnitCover'

describe('KnitCover', () => {
  it('tricote 8 × 8 mailles en V, aux teintes du jacquard du patron', () => {
    const { container } = render(<KnitCover id="g1" />)
    const cover = screen.getByTestId('knit-cover')
    const { motif, colors } = jacquard(seedOf('g1'))
    expect(cover).toHaveAttribute('data-motif', motif)
    const strokes = [...container.querySelectorAll('path')].map((p) => p.getAttribute('stroke'))
    expect(strokes).toHaveLength(64)
    expect(new Set(strokes).size).toBeGreaterThanOrEqual(2)
    for (const s of strokes) expect(colors).toContain(s)
  })
})

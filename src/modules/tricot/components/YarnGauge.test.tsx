import { render, screen } from '@testing-library/react'
import { YarnGauge } from './YarnGauge'

describe('YarnGauge', () => {
  it('déroule le fil selon les rangs tricotés, la pelote rapetisse', () => {
    const { rerender } = render(<YarnGauge done={0} total={80} hues={[]} seed={3} />)
    const gauge = screen.getByTestId('yarn-gauge')
    expect(gauge).toHaveAttribute('aria-hidden', 'true')
    // À 0 rang, le fil est entièrement caché (trait puis grand vide : rien au bout).
    expect(screen.getByTestId('yarn-gauge-reveal')).toHaveAttribute('stroke-dashoffset', '1000')
    expect(screen.getByTestId('yarn-gauge-reveal')).toHaveAttribute('stroke-dasharray', '1000 2000')
    expect(screen.getByTestId('yarn-gauge-ball').style.transform).toBe('rotate(0deg) scale(1.000)')

    rerender(<YarnGauge done={20} total={80} hues={[]} seed={3} />)
    expect(gauge).toHaveAttribute('data-fraction', '0.250')
    expect(screen.getByTestId('yarn-gauge-reveal')).toHaveAttribute('stroke-dashoffset', '750')
    expect(screen.getByTestId('yarn-gauge-ball').style.transform).toBe('rotate(180deg) scale(0.863)')
  })

  it('prend les couleurs de la laine du projet', () => {
    const { container } = render(<YarnGauge done={10} total={20} hues={['#ff0000']} seed={3} size="lg" />)
    const strokes = [...container.querySelectorAll('[stroke]')].map((e) => e.getAttribute('stroke'))
    expect(strokes).toContain('#ff0000')
    expect(strokes.some((s) => s?.startsWith('hsl(0 100%'))).toBe(true)
    expect(strokes.some((s) => s?.startsWith('hsl(230'))).toBe(false)
  })

  it('sans couleur de laine : indigo', () => {
    const { container } = render(<YarnGauge done={10} total={20} hues={[]} seed={3} />)
    expect([...container.querySelectorAll('[stroke]')].map((e) => e.getAttribute('stroke'))).toContain('#3f4fa0')
  })
})

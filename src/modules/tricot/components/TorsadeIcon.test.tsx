import { render } from '@testing-library/react'
import { TorsadeIcon } from './TorsadeIcon'

describe('TorsadeIcon', () => {
  it('dessine le T de Torsade : fond indigo arrondi, aiguille en bois, torsade écru et gaude', () => {
    const { container } = render(<TorsadeIcon className="size-5" aria-hidden />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('data-icon', 'torsade')
    expect(svg).toHaveClass('size-5')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('rect')).toHaveAttribute('fill', '#2f3b80')
    const html = svg.innerHTML
    expect(html).toContain('#c08a52') // bois de l'aiguille
    expect(html).toContain('#efe6d2') // brin écru
    expect(html).toContain('#d6a91f') // brin gaude
  })

  it('reste dans son cadre en largeur (rien ne déborde de la navigation)', () => {
    const { container } = render(<TorsadeIcon />)
    const xs = [...container.querySelectorAll('polyline')].flatMap((p) => p.getAttribute('points')!.split(' ').map((pt) => Number(pt.split(',')[0])))
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(100)
  })
})

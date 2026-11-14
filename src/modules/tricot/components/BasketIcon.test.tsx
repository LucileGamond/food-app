import { render } from '@testing-library/react'
import { BasketIcon } from './BasketIcon'

describe('BasketIcon', () => {
  it('dessine un panier de trois pelotes (garance, indigo, gaude), toujours pareil', () => {
    const { container, rerender } = render(<BasketIcon className="size-5" aria-hidden />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('data-icon', 'basket')
    expect(svg).toHaveClass('size-5')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const html = svg.innerHTML
    // Fond des trois pelotes : leur couleur de base, foncée.
    expect(html).toContain('hsl(230') // indigo
    expect(html).toContain('hsl(10 ') // garance
    expect(html).toContain('hsl(45') // gaude
    rerender(<BasketIcon className="size-5" aria-hidden />)
    expect(svg.innerHTML.replace(/_r_\w+_/g, '')).toBe(html.replace(/_r_\w+_/g, ''))
  })
})

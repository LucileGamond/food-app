import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { chartPosition, type ChartRow, type KnitChart } from '../../lib/chart'
import { ChartStrip } from './ChartStrip'

// Grille de 6 lignes entre 10 % et 70 % de la hauteur de l'image : chaque ligne fait 10 %.
const CHART: KnitChart = {
  id: 'c1',
  stepId: 's1',
  title: 'Torsade',
  gridTop: 0.1,
  gridBottom: 0.7,
  rows: 6,
  startRow: 1,
  repeats: true,
  flat: true,
  oddOnly: false,
  imagePath: 'c1.png',
  imageUrl: 'https://cdn.test/c1.png',
}

const at = (row: number) => chartPosition(CHART, row) as ChartRow
const pct = (value: string) => parseFloat(value)

function strip(row: number) {
  const onOpen = vi.fn()
  const { container } = render(<ChartStrip chart={CHART} position={at(row)} onOpen={onOpen} />)
  const button = container.querySelector('button')!
  const img = container.querySelector('img')!
  const band = button.querySelector('span')!
  return { button, img, band, onOpen }
}

/** Partie de l'image visible dans la bande (fractions de la hauteur), d'après le placement de l'image. */
function visible(img: HTMLImageElement) {
  const height = 100 / pct(img.style.height)
  const top = (-pct(img.style.top) / 100) * height
  return { top, bottom: top + height }
}

describe('bande du diagramme', () => {
  it('montre le rang à tricoter, surligné, avec un peu des rangs voisins', () => {
    // Rang 3 : 3e ligne en partant du bas, de 40 % à 50 % de l'image
    const { img, band } = strip(3)
    const shown = visible(img)
    expect(shown.top).toBeCloseTo(0.365, 3)
    expect(shown.bottom).toBeCloseTo(0.535, 3)
    // Bande surlignée : exactement la ligne du rang dans la partie visible
    const span = shown.bottom - shown.top
    expect(shown.top + (pct(band.style.top) / 100) * span).toBeCloseTo(0.4, 3)
    expect(shown.top + ((pct(band.style.top) + pct(band.style.height)) / 100) * span).toBeCloseTo(0.5, 3)
  })

  it('reste dans l’image au bord, et suit le sens de lecture', () => {
    // Rang 1 (endroit, de droite à gauche) contre le bas de la grille ; rang 2 (envers) dans l'autre sens
    const first = strip(1)
    expect(visible(first.img).bottom).toBeCloseTo(0.735, 3)
    expect(first.band.querySelector('span')!.className).toContain('right-1')
    expect(strip(2).band.querySelector('span')!.className).toContain('left-1')
    const full: KnitChart = { ...CHART, gridTop: 0, gridBottom: 1, rows: 1 }
    const { container } = render(<ChartStrip chart={full} position={chartPosition(full, 1) as ChartRow} onOpen={() => undefined} />)
    const img = container.querySelector('img')!
    expect(visible(img).top).toBeCloseTo(0, 5)
    expect(visible(img).bottom).toBeCloseTo(1, 5)
  })

  it('prend les proportions de l’image une fois chargée, et s’ouvre en grand', async () => {
    const { button, img, onOpen } = strip(3)
    expect(button.style.aspectRatio).toBe('8 / 1')
    Object.defineProperty(img, 'naturalWidth', { value: 600 })
    Object.defineProperty(img, 'naturalHeight', { value: 300 })
    fireEvent.load(img)
    // Image 2:1, bande de 17 % de sa hauteur
    const [width, height] = button.style.aspectRatio.split('/').map(Number)
    expect(width! / height!).toBeCloseTo(2 / 0.17, 3)
    await userEvent.setup().click(button)
    expect(onOpen).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Voir Torsade en grand' })).toBe(button)
  })

  it('rang envers non dessiné : bande en pointillé, sans flèche', () => {
    const jacquard = { ...CHART, oddOnly: true }
    const { container } = render(<ChartStrip chart={jacquard} position={chartPosition(jacquard, 2) as ChartRow} onOpen={() => undefined} />)
    const band = container.querySelector('button > span')!
    expect(band.className).toContain('border-dashed')
    expect(band.querySelector('svg')).toBeNull()
  })

  it('sans image : rien', () => {
    const { container } = render(<ChartStrip chart={{ ...CHART, imageUrl: null }} position={at(1)} onOpen={() => undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

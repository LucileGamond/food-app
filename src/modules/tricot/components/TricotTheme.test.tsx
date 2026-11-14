import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TricotTheme, useYarnHue } from './TricotTheme'

const root = document.documentElement

afterEach(() => {
  delete root.dataset.module
})

describe('TricotTheme', () => {
  it('pose data-module="tricot" sur <html> le temps de son affichage, puis le retire', () => {
    const { unmount } = render(
      <TricotTheme>
        <p>Projet</p>
      </TricotTheme>,
    )
    expect(screen.getByText('Projet')).toBeInTheDocument()
    expect(root.dataset.module).toBe('tricot')
    unmount()
    expect(root.dataset.module).toBeUndefined()
  })

  it('sert de route parente : affiche la page enfant', () => {
    render(
      <MemoryRouter initialEntries={['/tricot']}>
        <Routes>
          <Route element={<TricotTheme />}>
            <Route path="/tricot" element={<h1>Tricot</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Tricot' })).toBeInTheDocument()
    expect(root.dataset.module).toBe('tricot')
  })

  it('ne retire pas le thème d’un autre module posé entre-temps', () => {
    const { unmount } = render(<TricotTheme />, { wrapper: MemoryRouter })
    root.dataset.module = 'plantes'
    unmount()
    expect(root.dataset.module).toBe('plantes')
  })
})

describe('useYarnHue', () => {
  function Project({ hues }: { hues: string[] }) {
    useYarnHue(hues)
    return null
  }

  it('donne au projet la première couleur de sa laine, le temps de la page', () => {
    const { rerender, unmount } = render(<Project hues={['#d0563a', '#e8a33a']} />)
    expect(root.style.getPropertyValue('--yarn')).toBe('#d0563a')
    // Un brin du cordon par couleur.
    expect(root.style.getPropertyValue('--yarn-1')).toBe('#d0563a')
    expect(root.style.getPropertyValue('--yarn-2')).toBe('#e8a33a')
    expect(root.style.getPropertyValue('--yarn-3')).toBe('')
    expect(root.dataset.yarn).toBe('')
    rerender(<Project hues={['#7f9a7a']} />)
    expect(root.style.getPropertyValue('--yarn')).toBe('#7f9a7a')
    expect(root.style.getPropertyValue('--yarn-2')).toBe('')
    unmount()
    expect(root.style.getPropertyValue('--yarn')).toBe('')
    expect(root.style.getPropertyValue('--yarn-1')).toBe('')
    expect(root.dataset.yarn).toBeUndefined()
  })

  it('sans couleur, le module garde son indigo', () => {
    render(<Project hues={[]} />)
    expect(root.dataset.yarn).toBeUndefined()
    expect(root.style.getPropertyValue('--yarn')).toBe('')
  })
})

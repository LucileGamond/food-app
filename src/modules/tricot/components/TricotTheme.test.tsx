import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TricotTheme } from './TricotTheme'

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

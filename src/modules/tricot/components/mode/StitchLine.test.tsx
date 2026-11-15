import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { StitchLine } from './StitchLine'

const SETUP = '/tricot/p1?etape=s2'

function show(count: Parameters<typeof StitchLine>[0]['count']) {
  render(
    <MemoryRouter>
      <StitchLine count={count} setupTo={SETUP} />
    </MemoryRouter>,
  )
}

describe('mailles en fin de rang', () => {
  it('sûr : le nombre, sans (?)', () => {
    show({ kind: 'sure', stitches: 82 })
    expect(screen.getByText(/En fin de rang/)).toHaveTextContent('En fin de rang : 82 mailles')
    expect(screen.queryByRole('button', { name: 'Pourquoi ce nombre ?' })).not.toBeInTheDocument()
  })

  it('estimé : le (?) dit pourquoi et mène droit à la sous-étape à corriger', async () => {
    show({ kind: 'estimate', stitches: 82, reasons: ['Effet de « 1 dim. » deviné : -1 mailles.'], section: 1 })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pourquoi ce nombre ?' }))
    expect(await screen.findByText('Effet de « 1 dim. » deviné : -1 mailles.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Corriger la sous-étape' })).toHaveAttribute('href', `${SETUP}&sous-etape=2`)
  })

  it('inconnu sans sous-étape désignée : la préparation de l’étape', async () => {
    show({ kind: 'unknown', reason: 'Le nombre de mailles à la fin de l’étape n’est pas indiqué.' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pourquoi ce nombre ?' }))
    expect(await screen.findByRole('link', { name: 'Corriger la sous-étape' })).toHaveAttribute('href', SETUP)
  })
})

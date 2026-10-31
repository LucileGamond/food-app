import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SourceInput } from './SourceInput'

const SOURCES = ['Ottolenghi', 'Pâtisserie maison', 'Simple']

function setup(initial = '') {
  const changes: string[] = []
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <>
        <label htmlFor="source">Livre</label>
        <SourceInput
          id="source"
          value={value}
          sources={SOURCES}
          onChange={(v) => {
            changes.push(v)
            setValue(v)
          }}
        />
        <button type="button">Ailleurs</button>
      </>
    )
  }
  render(<Harness />)
  return { user: userEvent.setup(), input: screen.getByRole('combobox', { name: 'Livre' }), changes }
}

describe('SourceInput', () => {
  it('liste les sources existantes et en choisit une au clic', async () => {
    const { user, input } = setup()
    await user.click(input)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(SOURCES)
    await user.click(screen.getByRole('option', { name: 'Ottolenghi' }))
    expect(input).toHaveValue('Ottolenghi')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('filtre par la saisie et propose de créer une nouvelle source', async () => {
    const { user, input } = setup()
    await user.type(input, 'sim')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Simple', 'Créer « sim »'])

    await user.clear(input)
    await user.type(input, 'Le grand livre')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Créer « Le grand livre »'])
    await user.keyboard('{Enter}')
    expect(input).toHaveValue('Le grand livre')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('se navigue au clavier et se ferme avec Échap', async () => {
    const { user, input } = setup()
    await user.click(input)
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Simple' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(input).toHaveValue('Ottolenghi')

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('reprend l’écriture d’une source existante en quittant le champ', async () => {
    const { user, input } = setup()
    await user.type(input, 'PATISSERIE maison')
    expect(screen.queryByRole('option', { name: /Créer/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ailleurs' }))
    expect(input).toHaveValue('Pâtisserie maison')
  })

  it('montre toutes les sources quand une est déjà choisie', async () => {
    const { user, input } = setup('Simple')
    await user.click(input)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('option', { name: 'Simple' }).querySelector('svg')).toHaveClass('text-brand')
  })
})

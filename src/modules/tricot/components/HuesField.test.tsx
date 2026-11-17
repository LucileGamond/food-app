import { fireEvent, render, screen } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { useState } from 'react'
import { HuesField } from './HuesField'

function Harness({ initial = [] as string[], onChange = (_: string[]) => {} }) {
  const [hues, setHues] = useState(initial)
  return (
    <HuesField
      hues={hues}
      onChange={(next) => {
        setHues(next)
        onChange(next)
      }}
    />
  )
}

describe('HuesField', () => {
  it('ajoute des couleurs depuis le nuancier, 3 au plus', async () => {
    const user = setupUser()
    render(<Harness />)
    expect(screen.queryByRole('list', { name: 'Couleurs choisies' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter Indigo' }))
    // Déjà choisie : grisée dans le nuancier.
    expect(screen.getByRole('button', { name: 'Ajouter Indigo' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Ajouter Garance' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter Gaude' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    // Plein : le nuancier disparaît.
    expect(screen.queryByRole('group', { name: 'Nuancier' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Couleur 3')).toHaveValue('#e2b93a')
  })

  it('change une pastille au sélecteur (en minuscules) et en retire une', async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Harness initial={['#3f4fa0', '#b4472f']} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Couleur 2'), { target: { value: '#D0563A' } })
    expect(onChange).toHaveBeenLastCalledWith(['#3f4fa0', '#d0563a'])
    await user.click(screen.getByRole('button', { name: 'Retirer la couleur 1' }))
    expect(onChange).toHaveBeenLastCalledWith(['#d0563a'])
  })

  it('propose huit teintes au nuancier', () => {
    render(<Harness />)
    expect(screen.getAllByRole('button', { name: /^Ajouter / })).toHaveLength(8)
  })
})

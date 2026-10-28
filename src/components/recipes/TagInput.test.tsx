import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TagInput } from './TagInput'

function Harness({ initial = [] as string[], onChange = (_: string[]) => undefined }) {
  const [tags, setTags] = useState(initial)
  return (
    <TagInput
      value={tags}
      suggestions={['pâtes', 'végé']}
      onChange={(next) => {
        setTags(next)
        onChange(next)
      }}
    />
  )
}

const input = () => screen.getByPlaceholderText('Ajouter un tag puis Entrée')
const chosen = () => screen.queryAllByRole('listitem').map((li) => li.textContent)

describe('TagInput', () => {
  it('ne valide pas un tag tapé au clavier qui commence comme une suggestion', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(input(), 'pâtes fraîches')
    expect(chosen()).toEqual([])
    expect(input()).toHaveValue('pâtes fraîches')
    await user.keyboard('{Enter}')
    expect(chosen()).toEqual(['pâtes fraîches'])
  })

  it('valide aussitôt une suggestion choisie dans la liste', () => {
    render(<Harness />)
    // Choix dans la datalist : sans inputType (Firefox)…
    fireEvent.change(input(), { target: { value: 'végé' } })
    expect(chosen()).toEqual(['végé'])
    expect(input()).toHaveValue('')
    // … ou en remplacement de texte (Chrome).
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), 'pâtes')
      input().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }))
    })
    expect(chosen()).toEqual(['végé', 'pâtes'])
  })

  it('ne valide pas une suggestion obtenue en effaçant des lettres', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(input(), 'pâtesx{Backspace}')
    expect(input()).toHaveValue('pâtes')
    expect(chosen()).toEqual([])
  })

  it('valide à la virgule, à la sortie du champ, sans doublon, et retire avec Retour arrière', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Rapide']} />)
    await user.type(input(), 'rapide,dessert,')
    expect(chosen()).toEqual(['Rapide', 'dessert'])
    await user.type(input(), 'soir')
    await user.tab()
    expect(chosen()).toEqual(['Rapide', 'dessert', 'soir'])
    await user.click(input())
    await user.keyboard('{Backspace}')
    expect(chosen()).toEqual(['Rapide', 'dessert'])
    await user.click(screen.getByRole('button', { name: 'Retirer le tag Rapide' }))
    expect(chosen()).toEqual(['dessert'])
  })
})

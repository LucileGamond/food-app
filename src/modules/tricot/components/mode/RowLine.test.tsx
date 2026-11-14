import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RowGuide } from '../../lib/guide'
import { RowLine } from './RowLine'

const SETUP = '/tricot/p1?etape=s1'

function show(line: RowGuide) {
  render(
    <MemoryRouter>
      <RowLine line={line} stitches={{ kind: 'sure', stitches: 80 }} glossary={[]} setupTo={SETUP} onOpenChart={() => {}} />
    </MemoryRouter>,
  )
  return screen.getByRole('region', { name: 'À tricoter' })
}

/** Le mode tricoter renvoie à la préparation avec un seul libellé, partout (C3). */
describe('RowLine : aller préparer l’étape', () => {
  it('sous-étape à régler sur ce rang : « Préparer l’étape »', () => {
    const region = show({ row: 5, events: [{ kind: 'to-set', text: '5 cm (à régler) : jersey' }], context: null, charts: [], unknown: false })
    expect(within(region).getByRole('link', { name: 'Préparer l’étape' })).toHaveAttribute('href', SETUP)
    expect(within(region).queryByRole('link', { name: 'Modifier' })).not.toBeInTheDocument()
  })

  it('suite inconnue : le même lien', () => {
    const region = show({ row: 9, events: [], context: null, charts: [], unknown: true })
    expect(region).toHaveTextContent('La suite n’est pas connue')
    expect(within(region).getByRole('link', { name: 'Préparer l’étape' })).toHaveAttribute('href', SETUP)
  })

  it('pas de numéro de rang dans la carte : les nombres sont au compteur (L5)', () => {
    const region = show({ row: 41, events: [], context: '10 rangs : jersey', charts: [], unknown: false })
    expect(within(region).getByRole('heading')).toHaveTextContent(/^À tricoter$/)
    expect(region).not.toHaveTextContent('41')
  })

  it('rang ordinaire : pas de lien vers la préparation', () => {
    const region = show({ row: 2, events: [], context: '10 rangs : jersey', charts: [], unknown: false })
    expect(within(region).queryByRole('link')).not.toBeInTheDocument()
    expect(region).toHaveTextContent('10 rangs : jersey')
  })
})

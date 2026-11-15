import userEvent from '@testing-library/user-event'
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
  return screen.getByRole('region', { name: 'Ce rang' })
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

  it('le numéro du rang de l’étape à tricoter, dans le titre (revient sur L5, demandé le 2026-11-15)', () => {
    const region = show({ row: 41, events: [], context: '10 rangs : jersey', charts: [], unknown: false })
    expect(within(region).getByRole('heading')).toHaveTextContent(/^Ce rang · rang 41$/)
  })

  it('nomme la sous-étape où l’on est, et celle « en même temps »', () => {
    render(
      <MemoryRouter>
        <RowLine
          line={{ row: 14, events: [], context: null, charts: [], unknown: false }}
          stitches={{ kind: 'sure', stitches: 48 }}
          glossary={[]}
          setupTo={SETUP}
          onOpenChart={() => {}}
          sectionCount={4}
          substeps={[
            { index: 1, title: '1 diminution côté emmanchure — tous les 4 rangs (6 fois)', row: 10, rows: 24, finishable: false },
            { index: 2, title: 'En même temps, dès le rang 12 : 1 diminution côté encolure — tous les 2 rangs (5 fois)', row: 3, rows: 10, finishable: false },
          ]}
        />
      </MemoryRouter>,
    )
    expect(Array.from(screen.getByRole('list', { name: 'Sous-étapes en cours' }).children, (li) => li.textContent)).toEqual([
      'Sous-étape 2 sur 4 : 1 diminution côté emmanchure — tous les 4 rangs (6 fois)',
      'En même temps · Sous-étape 3 sur 4 : 1 diminution côté encolure — tous les 2 rangs (5 fois)',
    ])
  })

  it('rang suivant : ses consignes ; sans rien de particulier, quand arrive la suite ; rien après le dernier rang', () => {
    const base = { stitches: { kind: 'sure' as const, stitches: 48 }, glossary: [], setupTo: SETUP, onOpenChart: () => {} }
    const { unmount } = render(
      <MemoryRouter>
        <RowLine {...base} line={{ row: 14, events: [], context: 'jersey', charts: [], unknown: false }} next={{ row: 15, events: [{ kind: 'action', text: '1 diminution', count: 2, times: 5 }], context: null, charts: [], unknown: false }} upcoming={{ row: 15, inRows: 1, events: [] }} />
      </MemoryRouter>,
    )
    const next = screen.getByRole('region', { name: 'Rang suivant' })
    expect(next).toHaveTextContent('Rang suivant')
    expect(next).not.toHaveTextContent('Ensuite')
    unmount()
    const { unmount: unmount2 } = render(
      <MemoryRouter>
        <RowLine
          {...base}
          line={{ row: 14, events: [], context: 'jersey', charts: [], unknown: false }}
          next={{ row: 15, events: [], context: 'jersey', charts: [], unknown: false }}
          upcoming={{ row: 18, inRows: 4, events: [{ kind: 'action', text: '1 diminution', count: 3, times: 5 }] }}
        />
      </MemoryRouter>,
    )
    // Rien de particulier au rang suivant : son contexte ; la prochaine chose à faire a sa section « Ensuite »
    expect(screen.getByRole('region', { name: 'Rang suivant' })).toHaveTextContent('Rang suivant · rang 15jersey')
    expect(screen.getByRole('region', { name: 'Ensuite' })).toHaveTextContent('EnsuiteRang 18, dans 4 —')
    unmount2()
    render(
      <MemoryRouter>
        <RowLine {...base} line={{ row: 30, events: [{ kind: 'step-end', next: 'Col' }], context: null, charts: [], unknown: false }} next={null} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('region', { name: 'Rang suivant' })).not.toBeInTheDocument()
  })

  it('une question sur chaque rang : un petit bouton dans le titre de ce rang, du suivant et de « Ensuite »', async () => {
    const onAsk = vi.fn()
    render(
      <MemoryRouter>
        <RowLine
          line={{ row: 2, events: [], context: null, charts: [], unknown: false }}
          next={{ row: 3, events: [], context: null, charts: [], unknown: false }}
          upcoming={{ row: 8, inRows: 6, events: [{ kind: 'action', text: '1 aug.', count: 1, times: 2 }] }}
          stitches={{ kind: 'sure', stitches: 80 }}
          glossary={[]}
          setupTo={SETUP}
          onOpenChart={() => {}}
          onAsk={onAsk}
          question={<p>Panneau de la question</p>}
        />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await user.click(within(screen.getByRole('region', { name: 'Ce rang' })).getAllByRole('button', { name: 'Une question sur ce rang ?' })[0]!)
    await user.click(within(screen.getByRole('region', { name: 'Rang suivant' })).getByRole('button', { name: 'Une question sur le rang suivant ?' }))
    await user.click(within(screen.getByRole('region', { name: 'Ensuite' })).getByRole('button', { name: 'Une question sur le rang 8 ?' }))
    expect(onAsk.mock.calls).toEqual([[2], [3], [8]])
    // Le panneau, en bas de la carte
    expect(screen.getByText('Panneau de la question')).toBeInTheDocument()
  })

  it('rang ordinaire : pas de lien vers la préparation', () => {
    const region = show({ row: 2, events: [], context: '10 rangs : jersey', charts: [], unknown: false })
    expect(within(region).queryByRole('link')).not.toBeInTheDocument()
    expect(region).toHaveTextContent('10 rangs : jersey')
  })
})

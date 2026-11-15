import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { knitPattern, stashItem } from '@/test/knitFactories'
import { EMPTY_YARN } from '../lib/yarn'
import { KnittingPage } from './KnittingPage'

/** Couleurs de remplissage et de trait des éléments d'un dessin SVG. */
const paints = (el: Element) => [...el.querySelectorAll('[fill], [stroke]')].flatMap((e) => [e.getAttribute('fill'), e.getAttribute('stroke')])

beforeEach(() => localStorage.clear())

describe('KnittingPage', () => {
  it('projets en cours dans un bloc déplié : où ils en sont, et Tricoter d’un toucher ; les terminés à part', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listProjects.mockResolvedValue([
      { id: 'p1', title: 'Pull Bergamote', size: 'M', updatedAt: '', stepsDone: 1, stepsTotal: 3, current: { number: 2, title: 'Manches', rowCount: 12, totalRows: 40, times: 2, pass: 1 }, hues: ['#d0563a'] },
      { id: 'p2', title: 'Bonnet', size: '4 ans', updatedAt: '', stepsDone: 2, stepsTotal: 2, current: null, hues: [] },
      { id: 'p3', title: 'Châle', size: 'Unique', updatedAt: '', stepsDone: 0, stepsTotal: 1, current: { number: 1, title: 'Bordure', rowCount: 1, totalRows: null, times: 1, pass: 1 }, hues: [] },
    ])
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('button', { name: 'Projets en cours' })).toHaveAttribute('aria-expanded', 'true')
    const list = await screen.findByRole('list', { name: 'Projets en cours' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByRole('link', { name: /^Pull Bergamote/ })).toHaveAttribute('href', '/tricot/p1')
    expect(within(list).getByText('Étape 2 sur 3 · 12 / 40 rangs · 1re fois sur 2')).toBeInTheDocument()
    expect(within(list).getByRole('link', { name: 'Tricoter « Pull Bergamote »' })).toHaveAttribute('href', '/tricot/p1/tricoter')
    // Rangs de l'étape inconnus (ou patron adapté suivi) : seulement les rangs faits
    expect(within(list).getByText('Étape 1 sur 1 · 1 rang')).toBeInTheDocument()
    // Projet fini : à part, replié, sans bouton Tricoter
    expect(within(list).queryByText('Bonnet')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terminés (1)' }))
    const done = screen.getByRole('list', { name: 'Projets terminés' })
    expect(within(done).getByText('Terminé')).toBeInTheDocument()
    expect(within(done).queryByRole('link', { name: 'Tricoter « Bonnet »' })).not.toBeInTheDocument()
    // Jauge pelote et fil, aux couleurs de la laine : seulement quand les rangs de l'étape sont connus.
    const gauges = within(list).getAllByTestId('yarn-gauge')
    expect(gauges).toHaveLength(1)
    expect(gauges[0]).toHaveAttribute('data-fraction', '0.300')
    expect(paints(gauges[0]!)).toContain('#d0563a')
  })

  it('« + » pour un nouveau projet, sans explication ici ; puis bibliothèque, stock et mesures, chacun sur sa page', async () => {
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue([stashItem({ id: 'y1', yarn: { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino' } })])
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('link', { name: 'Nouveau projet' })).toHaveAttribute('href', '/tricot/nouveau')
    expect(screen.queryByText(/découpé en étapes/)).not.toBeInTheDocument()
    const others = screen.getByRole('navigation', { name: 'Le reste du tricot' })
    expect(within(others).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/tricot/patrons', '/tricot/laine', '/tricot/mesures'])
    expect(await within(others).findByRole('link', { name: /Stock de laine/ })).toHaveTextContent('1 laine')
    expect(within(others).getByRole('link', { name: /Fiches de mesures/ })).toHaveTextContent('aucune')
  })

  it('aucun projet en cours ; une erreur se réessaie', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listProjects.mockRejectedValueOnce(new Error('réseau'))
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucun projet en cours.')).toBeInTheDocument()
  })

  it('chargement : un spinner nommé', async () => {
    const api = fakeApi()
    api.knitting.listProjects.mockReturnValue(new Promise(() => {}))
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('status', { name: 'Chargement des projets' })).toBeInTheDocument()
  })
})

describe('KnittingPage : accès à la bibliothèque', () => {
  it('résume la bibliothèque : nombre de patrons et ceux déjà tricotés', async () => {
    const api = fakeApi()
    api.knitting.listPatterns.mockResolvedValue([
      knitPattern({ id: 'g1' }),
      knitPattern({ id: 'p1', title: 'Pull Bergamote', projects: [{ id: 'proj1', title: 'Pull Bergamote', size: 'M' }] }),
      knitPattern({ id: 'b1', title: 'Bonnet' }),
    ])
    renderWithApp(<KnittingPage />, { api })
    const link = await screen.findByRole('link', { name: /Bibliothèque de patrons/ })
    expect(link).toHaveAttribute('href', '/tricot/patrons')
    expect(await within(link).findByText('3 patrons · 1 tricoté')).toBeInTheDocument()
  })

  it('bibliothèque, stock ou mesures qui ne se chargent pas : on le dit', async () => {
    const api = fakeApi()
    api.knitting.listPatterns.mockRejectedValue(new AppError('Impossible de charger les patrons.'))
    api.knitting.listStash.mockRejectedValue(new AppError('Impossible de charger le stock de laine.'))
    api.knitting.listMeasures.mockRejectedValue(new AppError('Impossible de charger les mesures.'))
    renderWithApp(<KnittingPage />, { api })
    expect(await screen.findByRole('link', { name: /Bibliothèque de patrons/ })).toHaveTextContent('non chargée')
    expect(await screen.findByRole('link', { name: /Stock de laine/ })).toHaveTextContent('non chargé')
    expect(await screen.findByRole('link', { name: /Fiches de mesures/ })).toHaveTextContent('non chargées')
  })

  it('bibliothèque vide : « aucun patron »', async () => {
    renderWithApp(<KnittingPage />)
    expect(await screen.findByRole('link', { name: /Bibliothèque de patrons/ })).toHaveTextContent('aucun patron')
  })
})

import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { knitPattern, stashItem } from '@/test/knitFactories'
import { EMPTY_YARN } from '../lib/yarn'
import { KnittingStashPage } from './KnittingStashPage'

const MERINO = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }
const STASH = [stashItem({ yarn: MERINO })]

beforeEach(() => localStorage.clear())

describe('stock de laine', () => {
  it('ajoute, modifie et retire une laine du stock', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderWithApp(<KnittingStashPage />, { api })
    await screen.findByRole('heading', { name: 'Stock de laine', level: 1 })
    expect(screen.getByRole('link', { name: 'Tricot' })).toHaveAttribute('href', '/tricot')
    // Stock vide : le message le dit
    expect(await screen.findByText(/Aucune laine en stock/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter au stock' }))
    let dialog = await screen.findByRole('dialog', { name: 'Ajouter au stock' })
    await user.type(within(dialog).getByLabelText('Marque'), 'DROPS')
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '8')
    // Enregistrée, la laine apparaît dans le stock rechargé
    api.knitting.listStash.mockResolvedValue([stashItem({ yarn: { ...EMPTY_YARN, brand: 'DROPS', skeins: 8 } })])
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveStashItem).toHaveBeenCalledWith({ id: null, yarn: { ...EMPTY_YARN, brand: 'DROPS', skeins: 8 }, notes: '' }))
    expect(within(await screen.findByRole('list', { name: 'Stock de laine' })).getByRole('button', { name: 'Modifier DROPS' })).toBeInTheDocument()

    // Annuler l'ajout : rien n'est enregistré
    await user.click(screen.getByRole('button', { name: 'Ajouter au stock' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annuler' }))
    expect(api.knitting.saveStashItem).toHaveBeenCalledTimes(1)

    // Stock avec une laine : modifier, puis retirer
    cleanup()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.saveStashItem.mockClear()
    renderWithApp(<KnittingStashPage />, { api })
    const list = await screen.findByRole('list', { name: 'Stock de laine' })
    await user.click(within(list).getByRole('button', { name: 'Modifier DROPS Merino' }))
    dialog = await screen.findByRole('dialog', { name: 'Modifier la laine' })
    await user.clear(within(dialog).getByLabelText(/Nombre de pelotes/))
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '5')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveStashItem).toHaveBeenCalledWith({ id: 'st1', yarn: { ...MERINO, skeins: 5 }, notes: '' }))

    await user.click(within(list).getByRole('button', { name: 'Supprimer DROPS Merino du stock' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deleteStashItem).toHaveBeenCalledWith('st1'))
  })

  // Parcours court : le tri des patrons (lib/library.test.ts) et les idées (YarnIdeasSection.test.tsx) sont testés à part.
  it('cherche d’abord dans la bibliothèque, puis des idées avec l’IA', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    // 840 m, aiguilles 4 mm
    api.knitting.listPatterns.mockResolvedValue([knitPattern({ id: 'Gilet', title: 'Gilet', metersNeeded: 600, needleMm: 4 })])
    api.knitting.yarnIdeas.mockResolvedValue({
      ideas: [{ title: 'Snood torsadé', why: 'Mérinos doux.', size: 'adulte', meters: 300, needleMm: 4.5, search: 'cabled cowl', patterns: [] }],
      weight: 'worsted',
    })
    renderWithApp(<KnittingStashPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quel patron pour cette laine ?' })
    expect(dialog).toHaveTextContent('DROPS Merino · 840 m en stock')
    const fits = within(dialog).getByRole('list', { name: 'Patrons qui conviennent' })
    expect(within(fits).getByRole('link', { name: /^Gilet/ })).toHaveAttribute('href', '/tricot/patrons/Gilet')

    await user.click(within(dialog).getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await within(dialog).findByRole('list', { name: 'Idées de modèles' })).toHaveTextContent('Snood torsadé · adulte')
  })

  it('aucun patron ne convient : les idées sont mises en avant ; erreur lisible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.yarnIdeas.mockRejectedValue(new AppError('La recherche d’idées a échoué.'))
    renderWithApp(<KnittingStashPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Aucun patron dans ta bibliothèque.')
    await user.click(within(dialog).getByRole('button', { name: 'Des idées avec l’IA' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La recherche d’idées a échoué.')
  })

  it('« Quel patron ? » ouvre la fiche du patron qui convient', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue(STASH)
    api.knitting.listPatterns.mockResolvedValue([
      knitPattern({ id: 'g1', title: 'Gilet Rosée', metersNeeded: 600, needleMm: 4 }),
      knitPattern({ id: 'p1', title: 'Pull Bergamote', projects: [{ id: 'proj1', title: 'Pull Bergamote', size: 'M' }] }),
    ])
    renderWithApp(<KnittingStashPage />, { api })
    await user.click(await screen.findByRole('button', { name: 'Quel patron pour DROPS Merino ?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Quel patron pour cette laine ?' })
    expect(within(dialog).getByRole('heading', { name: 'Dans ta bibliothèque' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Gilet Rosée/ })).toHaveAttribute('href', '/tricot/patrons/g1')
    // Patron déjà tricoté, sans besoins notés : à vérifier
    expect(dialog).toHaveTextContent('À vérifier (métrage ou aiguilles non notés) : Pull Bergamote.')
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { ShoppingItem } from '@/lib/shopping'
import { fakeApi, renderWithApp, type FakeApi } from '@/test/fakes'
import { ShoppingListPage } from './ShoppingListPage'

const item = (overrides: Partial<ShoppingItem>): ShoppingItem => ({
  id: 'x',
  list_id: 'l1',
  name: 'x',
  quantity: null,
  unit: null,
  aisle: 'AUTRE',
  checked: false,
  position: 0,
  ...overrides,
})

const ITEMS: ShoppingItem[] = [
  item({ id: 'farine', name: 'Farine', quantity: 200, unit: 'g', aisle: 'EPICERIE_SALEE', position: 0 }),
  item({ id: 'pommes', name: 'Pommes', quantity: 6, aisle: 'FRUITS_LEGUMES', position: 1 }),
  item({ id: 'lait', name: 'Lait', quantity: 1, unit: 'l', aisle: 'CREMERIE', position: 2 }),
  item({ id: 'pain', name: 'Pain', aisle: 'BOULANGERIE', checked: true, position: 3 }),
]

function renderList(items: ShoppingItem[] = ITEMS, api: FakeApi = fakeApi()) {
  api.shopping.getList.mockResolvedValue({ id: 'l1', name: 'Courses du 25 oct.' })
  api.shopping.listItems.mockResolvedValue(structuredClone(items))
  return renderWithApp(<ShoppingListPage />, {
    api,
    route: '/courses/l1',
    path: '/courses/:id',
    extraRoutes: <Route path="/courses" element={<p>Écran des listes</p>} />,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const section = (name: RegExp | string) => screen.getByRole('region', { name, hidden: true })

describe('ShoppingListPage', () => {
  it('range les articles par rayon dans l’ordre du magasin, les cochés à part', async () => {
    renderList()
    expect(await screen.findByRole('heading', { name: 'Courses du 25 oct.', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('1 / 4 dans le caddie')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fruits et légumes',
      'Crèmerie',
      'Épicerie salée',
      'Dans le caddie (1)',
    ])
    expect(within(section('Épicerie salée')).getByRole('button', { name: /^Modifier Farine/ })).toHaveTextContent('Farine200 g')
    expect(within(section('Dans le caddie (1)')).getByRole('checkbox', { name: 'Décocher « Pain »' })).toBeChecked()
  })

  it('ajoute un article avec le rayon deviné ; le rayon reste modifiable', async () => {
    const user = userEvent.setup()
    const { api } = renderList([])
    expect(await screen.findByText('Ajoute ton premier article')).toBeInTheDocument()
    const name = screen.getByLabelText("Nom de l'article")
    await user.type(name, 'Yaourts nature')
    expect(screen.getByLabelText('Rayon')).toHaveValue('CREMERIE')
    await user.type(screen.getByLabelText('Quantité'), '4')
    await user.click(screen.getByRole('button', { name: "Ajouter l'article" }))
    expect(api.shopping.addItem).toHaveBeenCalledWith('l1', { name: 'Yaourts nature', quantity: 4, unit: null, aisle: 'CREMERIE' }, 0)
    expect(within(section('Crèmerie')).getByText('Yaourts nature')).toBeInTheDocument()
    expect(name).toHaveValue('')
    expect(name).toHaveFocus()

    // Rayon choisi à la main : il n'est plus deviné
    await user.selectOptions(screen.getByLabelText('Rayon'), 'SURGELES')
    await user.type(name, 'Pain')
    expect(screen.getByLabelText('Rayon')).toHaveValue('SURGELES')
    await user.selectOptions(screen.getByLabelText('Unité'), 'sachet')
    await user.click(screen.getByRole('button', { name: "Ajouter l'article" }))
    expect(api.shopping.addItem).toHaveBeenLastCalledWith('l1', { name: 'Pain', quantity: null, unit: 'sachet', aisle: 'SURGELES' }, 1)
  })

  it('additionne la quantité d’un article déjà présent (unités convertibles)', async () => {
    const user = userEvent.setup()
    const { api } = renderList()
    await screen.findByRole('heading', { level: 1 })
    await user.type(screen.getByLabelText("Nom de l'article"), 'farine')
    await user.type(screen.getByLabelText('Quantité'), '0,3')
    await user.selectOptions(screen.getByLabelText('Unité'), 'kg')
    await user.click(screen.getByRole('button', { name: "Ajouter l'article" }))
    expect(api.shopping.addItem).not.toHaveBeenCalled()
    expect(api.shopping.updateItem).toHaveBeenCalledWith('farine', { quantity: 500 })
    expect(await screen.findByText('Quantité ajoutée à « Farine » (500 g)')).toBeInTheDocument()
    expect(within(section('Épicerie salée')).getByText('500 g')).toBeInTheDocument()
  })

  it('signale un article sans quantité déjà présent', async () => {
    const user = userEvent.setup()
    const { api } = renderList()
    await screen.findByRole('heading', { level: 1 })
    await user.type(screen.getByLabelText("Nom de l'article"), 'Pommes{Enter}')
    // Pommes a une quantité : l'article sans quantité est ajouté à part
    expect(api.shopping.addItem).toHaveBeenCalledTimes(1)
    await user.type(screen.getByLabelText("Nom de l'article"), 'pommes{Enter}')
    expect(await screen.findByText('« Pommes » est déjà dans la liste')).toBeInTheDocument()
    expect(api.shopping.addItem).toHaveBeenCalledTimes(1)
  })

  it('refuse une quantité invalide', async () => {
    const user = userEvent.setup()
    renderList([])
    await screen.findByText('Ajoute ton premier article')
    await user.type(screen.getByLabelText("Nom de l'article"), 'Pommes')
    await user.type(screen.getByLabelText('Quantité'), 'beaucoup')
    expect(screen.getByText('Quantité invalide')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Ajouter l'article" })).toBeDisabled()
  })

  it('coche instantanément, sans attendre le serveur, et annule si le serveur refuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const pending = deferred<void>()
    api.shopping.updateItem.mockReturnValueOnce(pending.promise)
    renderList(undefined, api)
    await user.click(await screen.findByRole('checkbox', { name: 'Cocher « Lait »' }))
    expect(api.shopping.updateItem).toHaveBeenCalledWith('lait', { checked: true })
    expect(within(section(/Dans le caddie/)).getByText('Lait')).toBeInTheDocument()
    expect(screen.getByText('2 / 4 dans le caddie')).toBeInTheDocument()
    await act(async () => pending.resolve())

    api.shopping.updateItem.mockRejectedValueOnce(new AppError('Connexion impossible.'))
    await user.click(screen.getByRole('checkbox', { name: 'Décocher « Pain »' }))
    expect(await screen.findByText('Connexion impossible.')).toBeInTheDocument()
    expect(within(section(/Dans le caddie/)).getByText('Pain')).toBeInTheDocument()
  })

  it('annonce quand tout est dans le caddie, puis retire les cochés', async () => {
    const user = userEvent.setup()
    const { api } = renderList([item({ id: 'a', name: 'Pain', checked: true }), item({ id: 'b', name: 'Lait', checked: true, position: 1 })])
    expect(await screen.findByText('Tout est dans le caddie')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer les cochés' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('2 articles dans le caddie seront retirés de la liste.')
    await user.click(within(confirm).getByRole('button', { name: 'Retirer' }))
    expect(api.shopping.clearChecked).toHaveBeenCalledWith('l1')
    expect(await screen.findByText('Ajoute ton premier article')).toBeInTheDocument()
  })

  it('modifie un article et le supprime', async () => {
    const user = userEvent.setup()
    const { api } = renderList()
    await user.click(await screen.findByRole('button', { name: /^Modifier Lait/ }))
    const dialog = await screen.findByRole('dialog', { name: "Modifier l'article" })
    expect(within(dialog).getByLabelText('Nom')).toHaveValue('Lait')
    expect(within(dialog).getByLabelText('Quantité')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Unité')).toHaveValue('l')
    expect(within(dialog).getByLabelText('Rayon')).toHaveValue('CREMERIE')
    await user.clear(within(dialog).getByLabelText('Quantité'))
    await user.type(within(dialog).getByLabelText('Quantité'), '2')
    await user.clear(within(dialog).getByLabelText('Nom'))
    expect(within(dialog).getByText('Nom requis')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nom'), 'Lait d’avoine')
    await user.selectOptions(within(dialog).getByLabelText('Rayon'), 'BOISSONS')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.shopping.updateItem).toHaveBeenCalledWith('lait', { name: 'Lait d’avoine', quantity: 2, unit: 'l', aisle: 'BOISSONS' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(section('Boissons')).getByText('Lait d’avoine')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Modifier Pommes/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(api.shopping.deleteItem).toHaveBeenCalledWith('pommes')
    await waitFor(() => expect(screen.queryByText('Pommes')).not.toBeInTheDocument())
  })

  it('remet un article supprimé si le serveur refuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.shopping.deleteItem.mockRejectedValueOnce(new AppError("Impossible de supprimer l'article."))
    renderList(undefined, api)
    await user.click(await screen.findByRole('button', { name: /^Modifier Pommes/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText("Impossible de supprimer l'article.")).toBeInTheDocument()
    expect(within(section('Fruits et légumes')).getByText('Pommes')).toBeInTheDocument()
  })

  it('renomme et supprime la liste', async () => {
    const user = userEvent.setup()
    const { api } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Actions sur la liste' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renommer la liste' })
    await user.clear(within(dialog).getByLabelText('Nom'))
    await user.type(within(dialog).getByLabelText('Nom'), 'Marché')
    api.shopping.getList.mockResolvedValue({ id: 'l1', name: 'Marché' })
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.shopping.renameList).toHaveBeenCalledWith('l1', 'Marché')
    expect(await screen.findByRole('heading', { name: 'Marché', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions sur la liste' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer la liste' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Marché : 4 articles seront supprimés.')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(api.shopping.deleteList).toHaveBeenCalledWith('l1')
    expect(await screen.findByText('Écran des listes')).toBeInTheDocument()
  })

  it('garde le formulaire de renommage ouvert si le serveur refuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.shopping.renameList.mockRejectedValueOnce(new AppError('Impossible de renommer la liste.'))
    api.shopping.deleteList.mockRejectedValueOnce(new AppError('Impossible de supprimer la liste.'))
    renderList(undefined, api)
    await user.click(await screen.findByRole('button', { name: 'Actions sur la liste' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Impossible de renommer la liste.')).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }))

    await user.click(screen.getByRole('button', { name: 'Actions sur la liste' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer la liste' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Impossible de supprimer la liste.')).toBeInTheDocument()
    expect(screen.queryByText('Écran des listes')).not.toBeInTheDocument()
  })

  it('affiche « introuvable » pour une liste supprimée', async () => {
    const api = fakeApi()
    api.shopping.getList.mockResolvedValue(null)
    renderWithApp(<ShoppingListPage />, { api, route: '/courses/l9', path: '/courses/:id' })
    expect(await screen.findByText('Liste introuvable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour aux listes' })).toHaveAttribute('href', '/courses')
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.shopping.listItems.mockRejectedValueOnce(new AppError('Impossible de charger les articles.'))
    renderWithApp(<ShoppingListPage />, { api, route: '/courses/l1', path: '/courses/:id' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les articles.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Ajoute ton premier article')).toBeInTheDocument()
  })

  it('recharge en temps réel, mais pas pendant une écriture en cours', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.shopping.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderList(undefined, api)
      await screen.findByRole('heading', { level: 1 })
      const pending = deferred<void>()
      api.shopping.updateItem.mockReturnValueOnce(pending.promise)
      await user.click(screen.getByRole('checkbox', { name: 'Cocher « Lait »' }))

      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(api.shopping.listItems).toHaveBeenCalledTimes(1)
      expect(within(section(/Dans le caddie/)).getByText('Lait')).toBeInTheDocument()

      api.shopping.listItems.mockResolvedValue([...ITEMS.map((i) => (i.id === 'lait' ? { ...i, checked: true } : i)), item({ id: 'eric', name: 'Bières', aisle: 'BOISSONS', position: 9 })])
      await act(async () => pending.resolve())
      await waitFor(() => expect(api.shopping.listItems).toHaveBeenCalledTimes(2))
      expect(await within(section('Boissons')).findByText('Bières')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import type { ShoppingList } from '@/lib/shopping'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { ShoppingListsPage } from './ShoppingListsPage'

const TODAY = '2026-10-25'

const LISTS: ShoppingList[] = [
  { id: 'l1', name: 'Courses du 25 oct.', updated_at: '2026-10-25T09:30:00Z', total: 12, checked: 3 },
  { id: 'l2', name: 'Apéro samedi', updated_at: '2026-10-24T18:00:00Z', total: 2, checked: 2 },
  { id: 'l3', name: 'Vide', updated_at: '2026-10-20T08:00:00Z', total: 0, checked: 0 },
]

function renderLists(lists: ShoppingList[] = LISTS, api = fakeApi()) {
  api.shopping.listLists.mockResolvedValue(lists)
  return renderWithApp(<ShoppingListsPage today={TODAY} />, {
    api,
    route: '/courses',
    path: '/courses',
    extraRoutes: <Route path="/courses/:id" element={<p>Écran liste</p>} />,
  })
}

describe('ShoppingListsPage', () => {
  it('affiche les listes avec leur avancement', async () => {
    renderLists()
    const list = await screen.findByRole('list', { name: 'Listes de courses' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(within(items[0]!).getByRole('link', { name: /Courses du 25 oct\./ })).toHaveAttribute('href', '/courses/l1')
    expect(items[0]).toHaveTextContent('3 / 12 articles')
    expect(items[1]).toHaveTextContent('2 / 2 articles')
    expect(items[2]).toHaveTextContent('Vide')
  })

  it('crée une liste avec le nom proposé puis l’ouvre', async () => {
    const user = userEvent.setup()
    const { api } = renderLists([])
    expect(await screen.findByText('Aucune liste')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Nouvelle liste' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle liste' })
    expect(within(dialog).getByLabelText('Nom')).toHaveValue('Courses du 25 oct.')
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }))
    expect(api.shopping.createList).toHaveBeenCalledWith('Courses du 25 oct.')
    expect(await screen.findByText('Écran liste')).toBeInTheDocument()
  })

  it('refuse un nom vide ou trop long, et affiche l’erreur du serveur', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.shopping.createList.mockRejectedValueOnce(new AppError('Impossible de créer la liste.'))
    renderLists([], api)
    await user.click((await screen.findAllByRole('button', { name: 'Nouvelle liste' }))[0]!)
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('Nom')
    await user.clear(input)
    expect(within(dialog).getByRole('button', { name: 'Créer' })).toBeDisabled()
    await user.type(input, 'x'.repeat(81))
    expect(within(dialog).getByText('80 caractères maximum')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'Marché')
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }))
    expect(await screen.findByText('Impossible de créer la liste.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renomme et supprime une liste', async () => {
    const user = userEvent.setup()
    const { api } = renderLists()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « Apéro samedi »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renommer la liste' })
    await user.clear(within(dialog).getByLabelText('Nom'))
    await user.type(within(dialog).getByLabelText('Nom'), 'Apéro dimanche')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.shopping.renameList).toHaveBeenCalledWith('l2', 'Apéro dimanche')
    expect(await screen.findByText('Liste renommée')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions pour « Courses du 25 oct. »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Courses du 25 oct. : 12 articles seront supprimés.')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(api.shopping.deleteList).toHaveBeenCalledWith('l1')
    expect(await screen.findByText('Liste supprimée')).toBeInTheDocument()
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.shopping.listLists.mockRejectedValueOnce(new AppError('Impossible de charger les listes de courses.'))
    renderWithApp(<ShoppingListsPage today={TODAY} />, { api, route: '/courses', path: '/courses' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les listes de courses.')
    api.shopping.listLists.mockResolvedValue(LISTS)
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('list', { name: 'Listes de courses' })).toBeInTheDocument()
  })

  it('se met à jour quand l’autre personne modifie une liste', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.shopping.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderLists([], api)
      await screen.findByText('Aucune liste')
      api.shopping.listLists.mockResolvedValue([LISTS[0]!])
      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      await waitFor(() => expect(screen.getByRole('link', { name: /Courses du 25 oct\./ })).toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })
})

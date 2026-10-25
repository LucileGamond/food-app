import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { InboxItem } from '@/lib/inbox'
import { ERIC, LUCILE, fakeApi, renderWithApp } from '@/test/fakes'
import { PlanningPage } from './PlanningPage'

const TODAY = '2026-10-20'

const item = (id: string, title: string, extra: Partial<InboxItem> = {}): InboxItem => ({
  id,
  title,
  url: null,
  recipe_id: null,
  created_at: `2026-10-19T10:00:0${id.length}Z`,
  ...extra,
})

const CREPES = item('i1', 'Pâte à crêpes', { url: 'https://www.marmiton.org/recettes/crepes.aspx' })
const RACLETTE = item('i2', 'Raclette')
const CURRY = item('i3', 'Curry de légumes', { recipe_id: 'r-curry' })

function renderPlanning(items: InboxItem[] = [CREPES, RACLETTE, CURRY], api = fakeApi()) {
  api.inbox.listItems.mockResolvedValue(items)
  return renderWithApp(<PlanningPage today={TODAY} />, { api, route: '/planning', path: '/planning' })
}

// hidden : le panneau reste interrogeable quand un dialogue modal est ouvert.
const panel = () => screen.getByRole('region', { name: /À planifier/, hidden: true })

describe('PlanningPage — liste « À planifier »', () => {
  it('affiche les liens, idées et recettes en attente', async () => {
    renderPlanning()
    const list = await screen.findByRole('list', { name: 'Éléments à planifier' })
    const items = within(list).getAllByTestId('inbox-item')
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Pâte à crêpesmarmiton.org'),
      expect.stringContaining('RacletteIdée'),
      expect.stringContaining('Curry de légumesRecette enregistrée'),
    ])
    expect(within(items[2]!).getByRole('link', { name: 'Curry de légumes' })).toHaveAttribute('href', '/recettes/r-curry')
    expect(within(panel()).getByText('3')).toBeInTheDocument()
  })

  it('se replie et se déplie (téléphone)', async () => {
    const user = userEvent.setup()
    renderPlanning()
    const toggle = await screen.findByRole('button', { name: /À planifier/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('ajoute un lien puis récupère le titre de la page', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.inbox.fetchTitle.mockResolvedValue('Tarte tatin facile')
    renderPlanning([], api)
    expect(await within(panel()).findByText(/Rien en attente/)).toBeInTheDocument()

    api.inbox.listItems.mockResolvedValue([item('new-item', 'cuisine.fr', { url: 'https://cuisine.fr/tatin' })])
    await user.type(screen.getByLabelText('Lien ou idée à planifier'), 'https://cuisine.fr/tatin{Enter}')
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://cuisine.fr/tatin', title: 'cuisine.fr' })
    expect(await within(panel()).findByText('cuisine.fr', { selector: 'p.font-medium' })).toBeInTheDocument()
    expect(screen.getByLabelText('Lien ou idée à planifier')).toHaveValue('')

    await waitFor(() => expect(api.inbox.renameItem).toHaveBeenCalledWith('new-item', 'Tarte tatin facile', 'cuisine.fr'))
    expect(api.inbox.fetchTitle).toHaveBeenCalledWith('https://cuisine.fr/tatin')
  })

  it('ajoute une idée sans chercher de titre ; signale un doublon', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderPlanning([], api)
    await within(panel()).findByText(/Rien en attente/)
    await user.type(screen.getByLabelText('Lien ou idée à planifier'), '  Raclette  ')
    await user.click(screen.getByRole('button', { name: 'Ajouter à la liste' }))
    expect(api.inbox.addItem).toHaveBeenCalledWith({ title: 'Raclette' })
    expect(api.inbox.fetchTitle).not.toHaveBeenCalled()

    api.inbox.addItem.mockRejectedValueOnce(new AppError('Déjà dans la liste « À planifier ».'))
    await user.type(screen.getByLabelText('Lien ou idée à planifier'), 'https://cuisine.fr/tatin{Enter}')
    expect(await screen.findByText('Déjà dans la liste « À planifier ».')).toBeInTheDocument()
    // La saisie est conservée pour pouvoir corriger
    expect(screen.getByLabelText('Lien ou idée à planifier')).toHaveValue('https://cuisine.fr/tatin')
  })

  it('planifie un élément : jour, créneau et personnes', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderPlanning(undefined, api)
    await user.click(await screen.findByRole('button', { name: 'Planifier « Pâte à crêpes »' }))
    const dialog = await screen.findByRole('dialog', { name: 'Planifier' })
    expect(dialog).toHaveTextContent('Pâte à crêpes')
    expect(within(dialog).getByLabelText('Jour')).toHaveValue(TODAY)
    expect(within(dialog).getByLabelText('Créneau')).toHaveValue('DINNER')
    expect(within(dialog).getByRole('checkbox', { name: 'Lucile' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Eric' })).not.toBeChecked()

    await user.selectOptions(within(dialog).getByLabelText('Jour'), '2026-10-22')
    await user.selectOptions(within(dialog).getByLabelText('Créneau'), 'LUNCH')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Eric' }))
    api.inbox.listItems.mockResolvedValue([RACLETTE, CURRY])
    await user.click(within(dialog).getByRole('button', { name: 'Planifier' }))

    expect(api.inbox.planItem).toHaveBeenCalledWith('i1', '2026-10-22', 'LUNCH', [LUCILE.id, ERIC.id])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(panel()).queryByText('Pâte à crêpes')).not.toBeInTheDocument()
    // Le planning est rechargé pour afficher le nouveau repas
    await waitFor(() => expect(api.meals.listMeals.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('exige au moins une personne pour planifier', async () => {
    const user = userEvent.setup()
    renderPlanning()
    await user.click(await screen.findByRole('button', { name: 'Planifier « Raclette »' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Lucile' }))
    expect(within(dialog).getByText('Choisis au moins une personne.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Planifier' })).toBeDisabled()
  })

  it('remet l’élément dans la liste si la planification échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.inbox.planItem.mockRejectedValueOnce(new AppError('Impossible de planifier ce repas.'))
    renderPlanning(undefined, api)
    await user.click(await screen.findByRole('button', { name: 'Planifier « Raclette »' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Planifier' }))
    expect(await screen.findByText('Impossible de planifier ce repas.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(panel()).getByText('Raclette')).toBeInTheDocument()
  })

  it('renomme une idée et retire un élément', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderPlanning(undefined, api)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « Raclette »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renommer' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renommer' })
    await user.clear(within(dialog).getByLabelText('Titre'))
    await user.type(within(dialog).getByLabelText('Titre'), 'Raclette savoyarde')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(api.inbox.renameItem).toHaveBeenCalledWith('i2', 'Raclette savoyarde')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Recette enregistrée : pas de renommage (le titre est celui de la recette)
    await user.click(screen.getByRole('button', { name: 'Actions pour « Curry de légumes »' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Renommer' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Ouvrir le lien' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Retirer de la liste' }))
    expect(api.inbox.deleteItem).toHaveBeenCalledWith('i3')
  })

  it('propose d’ouvrir le lien d’un élément', async () => {
    const user = userEvent.setup()
    renderPlanning()
    await user.click(await screen.findByRole('button', { name: 'Actions pour « Pâte à crêpes »' }))
    expect(await screen.findByRole('menuitem', { name: 'Ouvrir le lien' })).toHaveAttribute('href', CREPES.url)
  })

  it('affiche une erreur de chargement de la liste et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.inbox.listItems.mockRejectedValueOnce(new AppError('Impossible de charger la liste à planifier.'))
    renderWithApp(<PlanningPage today={TODAY} />, { api, route: '/planning', path: '/planning' })
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Impossible de charger la liste à planifier.')
    api.inbox.listItems.mockResolvedValue([RACLETTE])
    await user.click(within(panel()).getByRole('button', { name: 'Réessayer' }))
    expect(await within(panel()).findByText('Raclette')).toBeInTheDocument()
  })

  it('se met à jour quand l’autre personne ajoute un élément', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.inbox.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderPlanning([], api)
      await within(panel()).findByText(/Rien en attente/)
      api.inbox.listItems.mockResolvedValue([RACLETTE])
      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(await within(panel()).findByText('Raclette')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

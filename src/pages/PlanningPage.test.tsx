import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { ERIC, LUCILE, fakeApi, mealFixture, renderWithApp } from '@/test/fakes'
import { PlanningPage } from './PlanningPage'

const TODAY = '2026-10-20'

function renderPlanning(api = fakeApi()) {
  return renderWithApp(<PlanningPage today={TODAY} />, {
    api,
    route: '/planning',
    path: '/planning',
    extraRoutes: <Route path="/recettes/:id/modifier" element={<p>Formulaire recette</p>} />,
  })
}

function slot(day: string, label: 'Midi' | 'Soir') {
  return screen.getByRole('region', { name: `${day} — ${label}` })
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole('button', { name: `Actions pour ${title}` }))
  return screen.findByRole('menu')
}

describe('PlanningPage', () => {
  it('affiche 7 jours à partir d’aujourd’hui avec les créneaux Midi et Soir', async () => {
    const { api } = renderPlanning()
    expect(await screen.findAllByTestId('day-card')).toHaveLength(7)
    expect(screen.getByText('Du 20 octobre au 26 octobre')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Mardi 20 octobre' })).toHaveTextContent("Aujourd'hui")
    expect(within(slot('Mardi 20 octobre', 'Midi')).getByText('Aucun repas prévu')).toBeInTheDocument()
    expect(screen.getAllByText('Aucun repas')).toHaveLength(7)
    expect(api.meals.listMeals).toHaveBeenCalledWith('2026-10-20', '2026-10-26')
  })

  it('navigue de 7 jours en 7 jours et revient à aujourd’hui', async () => {
    const user = userEvent.setup()
    const { api } = renderPlanning()
    await screen.findAllByTestId('day-card')
    const today = screen.getByRole('button', { name: "Aujourd'hui" })
    expect(today).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Semaine suivante' }))
    expect(await screen.findByText('Du 27 octobre au 2 novembre')).toBeInTheDocument()
    expect(api.meals.listMeals).toHaveBeenLastCalledWith('2026-10-27', '2026-11-02')

    await user.click(screen.getByRole('button', { name: 'Semaine précédente' }))
    await user.click(screen.getByRole('button', { name: 'Semaine précédente' }))
    expect(await screen.findByText('Du 13 octobre au 19 octobre')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }))
    expect(await screen.findByText('Du 20 octobre au 26 octobre')).toBeInTheDocument()
  })

  it('affiche les repas dans leur créneau avec les personnes et les liens', async () => {
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([
      mealFixture({ id: 'a', people: [LUCILE.id, ERIC.id], recipe: { title: 'Pâtes', notes: 'Voir https://exemple.fr/pates' } }),
      mealFixture({ id: 'b', meal_date: '2026-10-21', slot: 'DINNER', recipe: { id: 'saved', is_saved: true, title: 'Curry' } }),
    ])
    renderPlanning(api)
    await screen.findByText('Pâtes')

    const lunch = slot('Mardi 20 octobre', 'Midi')
    expect(within(lunch).getByText('Pâtes')).toBeInTheDocument()
    expect(await within(lunch).findByText('Eric et Lucile')).toBeInTheDocument()
    expect(within(lunch).getByRole('link', { name: 'exemple.fr/pates' })).toHaveAttribute('href', 'https://exemple.fr/pates')
    expect(screen.getByRole('article', { name: 'Mardi 20 octobre' })).toHaveTextContent('1 repas')

    const dinner = slot('Mercredi 21 octobre', 'Soir')
    expect(within(dinner).getByRole('link', { name: 'Curry' })).toHaveAttribute('href', '/recettes/saved')
    expect(within(dinner).getByLabelText('Recette sauvegardée')).toBeInTheDocument()
  })

  it('ajoute un repas ponctuel, avec l’utilisateur connecté coché par défaut', async () => {
    const user = userEvent.setup()
    const { api } = renderPlanning()
    await screen.findAllByTestId('day-card')

    await user.click(screen.getByRole('button', { name: 'Ajouter un repas — Mardi 20 octobre, Soir' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Mardi 20 octobre')).toBeInTheDocument()
    expect(within(dialog).getByText('Soir')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: 'Lucile' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Eric' })).not.toBeChecked()

    const save = within(dialog).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Titre'), '  Soupe  ')
    await user.type(within(dialog).getByLabelText('Lien de la recette'), 'pas-un-lien')
    expect(within(dialog).getByText(/Lien invalide/)).toBeInTheDocument()
    expect(save).toBeDisabled()
    await user.clear(within(dialog).getByLabelText('Lien de la recette'))
    await user.type(within(dialog).getByLabelText('Lien de la recette'), 'https://soupe.fr')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Eric' }))
    await user.type(within(dialog).getByLabelText('Notes'), 'Avec du pain')
    expect(within(dialog).getByText('12/2000')).toBeInTheDocument()

    await user.click(save)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.meals.createMeal).toHaveBeenCalledWith({
      date: '2026-10-20',
      slot: 'DINNER',
      people: [LUCILE.id, ERIC.id],
      source: { kind: 'adhoc', title: 'Soupe', notes: 'Avec du pain', url: 'https://soupe.fr' },
    })
    expect(api.meals.listMeals).toHaveBeenCalledTimes(2)
  })

  it('exige au moins une personne', async () => {
    const user = userEvent.setup()
    renderPlanning()
    await screen.findAllByTestId('day-card')
    await user.click(screen.getByRole('button', { name: 'Ajouter un repas — Mardi 20 octobre, Midi' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Titre'), 'Soupe')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Lucile' }))
    expect(within(dialog).getByText('Choisis au moins une personne')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })

  it('ajoute un repas à partir d’une recette sauvegardée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.listSavedSummaries.mockResolvedValue([
      { id: 'r-curry', is_saved: true, title: 'Curry', notes: null, url: null, tags: ['végé'] },
      { id: 'r-tarte', is_saved: true, title: 'Tarte', notes: null, url: null, tags: [] },
    ])
    renderPlanning(api)
    await screen.findAllByTestId('day-card')
    await user.click(screen.getByRole('button', { name: 'Ajouter un repas — Mardi 20 octobre, Midi' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('tab', { name: 'Recette sauvegardée' }))
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await user.type(within(dialog).getByRole('searchbox', { name: 'Rechercher une recette' }), 'tar')
    expect(within(dialog).queryByRole('radio', { name: /Curry/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /Tarte/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.meals.createMeal).toHaveBeenCalledWith({
        date: '2026-10-20', slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'saved', recipeId: 'r-tarte' },
      }),
    )
  })

  it('indique quand aucune recette n’est sauvegardée', async () => {
    const user = userEvent.setup()
    renderPlanning()
    await screen.findAllByTestId('day-card')
    await user.click(screen.getByRole('button', { name: 'Ajouter un repas — Mardi 20 octobre, Midi' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Recette sauvegardée' }))
    expect(await within(dialog).findByText('Aucune recette sauvegardée pour le moment.')).toBeInTheDocument()
  })

  it('modifie un repas ponctuel avec le formulaire prérempli', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([mealFixture({ people: [ERIC.id], recipe: { title: 'Pâtes', notes: 'n', url: 'https://a.fr' } })])
    renderPlanning(api)
    await screen.findByText('Pâtes')

    const menu = await openMenu(user, 'Pâtes')
    await user.click(within(menu).getByRole('menuitem', { name: 'Modifier' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le repas' })
    expect(within(dialog).getByLabelText('Titre')).toHaveValue('Pâtes')
    expect(within(dialog).getByLabelText('Notes')).toHaveValue('n')
    expect(within(dialog).getByLabelText('Lien de la recette')).toHaveValue('https://a.fr')
    expect(within(dialog).getByRole('checkbox', { name: 'Eric' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Lucile' })).not.toBeChecked()

    await user.clear(within(dialog).getByLabelText('Titre'))
    await user.type(within(dialog).getByLabelText('Titre'), 'Pâtes pesto')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.meals.updateMeal).toHaveBeenCalledWith('m1', [ERIC.id], { kind: 'adhoc', title: 'Pâtes pesto', notes: 'n', url: 'https://a.fr' }),
    )
  })

  it('préremplit l’onglet recette sauvegardée pour un repas qui en utilise une', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const curry = { id: 'r-curry', is_saved: true, title: 'Curry', notes: null, url: null, tags: [] }
    api.meals.listMeals.mockResolvedValue([mealFixture({ recipe: curry })])
    api.recipes.listSavedSummaries.mockResolvedValue([curry])
    renderPlanning(api)
    await screen.findByRole('link', { name: 'Curry' })
    const menu = await openMenu(user, 'Curry')
    expect(within(menu).queryByRole('menuitem', { name: 'Sauvegarder la recette' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Modifier' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('radio', { name: /Curry/ })).toBeChecked()
  })

  it('garde le formulaire ouvert si l’enregistrement échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.createMeal.mockRejectedValue(new AppError('Serveur indisponible'))
    renderPlanning(api)
    await screen.findAllByTestId('day-card')
    await user.click(screen.getByRole('button', { name: 'Ajouter un repas — Mardi 20 octobre, Midi' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Titre'), 'Soupe')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Serveur indisponible')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('déplace un repas par le menu, de façon optimiste', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValueOnce([mealFixture()])
    api.meals.moveMeal.mockImplementation(() => new Promise(() => undefined))
    renderPlanning(api)
    await screen.findByText('Pâtes tomate')

    const menu = await openMenu(user, 'Pâtes tomate')
    await user.click(within(menu).getByRole('menuitem', { name: 'Déplacer…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Déplacer le repas' })
    const submit = within(dialog).getByRole('button', { name: 'Déplacer' })
    expect(submit).toBeDisabled()
    await user.selectOptions(within(dialog).getByLabelText('Jour'), '2026-10-22')
    await user.selectOptions(within(dialog).getByLabelText('Créneau'), 'DINNER')
    await user.click(submit)

    expect(api.meals.moveMeal).toHaveBeenCalledWith('m1', '2026-10-22', 'DINNER')
    expect(await within(slot('Jeudi 22 octobre', 'Soir')).findByText('Pâtes tomate')).toBeInTheDocument()
    expect(within(slot('Mardi 20 octobre', 'Midi')).queryByText('Pâtes tomate')).not.toBeInTheDocument()
  })

  it('annule le déplacement si le serveur refuse', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([mealFixture()])
    api.meals.moveMeal.mockRejectedValue(new AppError('Refusé'))
    renderPlanning(api)
    await screen.findByText('Pâtes tomate')
    const menu = await openMenu(user, 'Pâtes tomate')
    await user.click(within(menu).getByRole('menuitem', { name: 'Déplacer…' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Créneau'), 'DINNER')
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer' }))
    expect(await screen.findByText('Refusé')).toBeInTheDocument()
    expect(within(slot('Mardi 20 octobre', 'Midi')).getByText('Pâtes tomate')).toBeInTheDocument()
  })

  it('duplique un repas vers le premier autre jour par défaut', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([mealFixture()])
    renderPlanning(api)
    await screen.findByText('Pâtes tomate')
    const menu = await openMenu(user, 'Pâtes tomate')
    await user.click(within(menu).getByRole('menuitem', { name: 'Dupliquer…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dupliquer le repas' })
    expect(within(dialog).getByLabelText('Jour')).toHaveValue('2026-10-21')
    expect(within(dialog).getByLabelText('Créneau')).toHaveValue('LUNCH')
    await user.click(within(dialog).getByRole('button', { name: 'Dupliquer' }))
    await waitFor(() => expect(api.meals.duplicateMeal).toHaveBeenCalledWith('m1', '2026-10-21', 'LUNCH'))
  })

  it('supprime un repas après confirmation', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValueOnce([mealFixture({ people: [LUCILE.id, ERIC.id] })])
    renderPlanning(api)
    await screen.findByText('Pâtes tomate')

    const menu = await openMenu(user, 'Pâtes tomate')
    await user.click(within(menu).getByRole('menuitem', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer ce repas ?' })
    expect(dialog).toHaveTextContent('Pâtes tomate')
    expect(dialog).toHaveTextContent('Mardi 20 octobre · Midi · Eric et Lucile')

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(api.meals.deleteMeal).not.toHaveBeenCalled()

    await user.click(within(await openMenu(user, 'Pâtes tomate')).getByRole('menuitem', { name: 'Supprimer' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(api.meals.deleteMeal).toHaveBeenCalledWith('m1')
    await waitFor(() => expect(screen.queryByText('Pâtes tomate')).not.toBeInTheDocument())
  })

  it('ouvre le formulaire de recette pour sauvegarder une recette ponctuelle', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockResolvedValue([mealFixture()])
    renderPlanning(api)
    await screen.findByText('Pâtes tomate')
    const menu = await openMenu(user, 'Pâtes tomate')
    await user.click(within(menu).getByRole('menuitem', { name: 'Sauvegarder la recette' }))
    expect(await screen.findByText('Formulaire recette')).toBeInTheDocument()
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.meals.listMeals.mockRejectedValueOnce(new AppError('Hors ligne'))
    renderPlanning(api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findAllByTestId('day-card')).toHaveLength(7)
  })

  it('recharge quand l’autre personne modifie le planning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.meals.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderPlanning(api)
      await screen.findAllByTestId('day-card')
      api.meals.listMeals.mockResolvedValue([mealFixture({ recipe: { title: 'Ajout d’Eric' } })])
      act(() => {
        notify()
        notify()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(await screen.findByText('Ajout d’Eric')).toBeInTheDocument()
      expect(api.meals.listMeals).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

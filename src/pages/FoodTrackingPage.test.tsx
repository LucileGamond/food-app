import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { Consumption, FoodPeriod, PeriodItem } from '@/lib/food'
import { ERIC, LUCILE, fakeApi, renderWithApp, type FakeApi } from '@/test/fakes'
import { FoodTrackingPage } from './FoodTrackingPage'

const TODAY = '2026-10-24'

const PERIOD: FoodPeriod = { id: 'p1', profile_id: LUCILE.id, start_date: '2026-10-19', end_date: '2026-11-02' }
const OLD: FoodPeriod = { id: 'p0', profile_id: LUCILE.id, start_date: '2026-10-05', end_date: '2026-10-18' }

const c = (id: string, consumed_on: string): Consumption => ({ id, consumed_on, created_at: `${consumed_on}T12:00:00Z` })

function item(overrides: Partial<PeriodItem>): PeriodItem {
  return { id: 'x', meal: 'LUNCH', category: 'Autres', name: 'X', quantity: null, unit: null, allowed_occurrences: 1, position: 0, consumptions: [], ...overrides }
}

const ITEMS: PeriodItem[] = [
  item({ id: 'cafe', meal: 'BREAKFAST', category: 'Boisson', name: 'Café au lait', quantity: 250, unit: 'ml', allowed_occurrences: 7, position: 10 }),
  item({
    id: 'yaourt',
    meal: 'LUNCH',
    category: 'Produit laitier',
    name: 'Yaourt',
    quantity: 125,
    unit: 'g',
    allowed_occurrences: 2,
    position: 20,
    consumptions: [c('y1', '2026-10-20'), c('y2', '2026-10-24')],
  }),
  item({
    id: 'fruit',
    meal: 'SNACK',
    category: 'Végétaux et fruits',
    name: 'Fruit',
    quantity: 150,
    unit: 'g',
    allowed_occurrences: 1,
    position: 30,
    consumptions: [c('f1', '2026-10-21'), c('f2', '2026-10-22')],
  }),
]

function renderTracking({ api = fakeApi(), periods = [PERIOD, OLD], items = ITEMS, hour = 12, today = TODAY } = {}) {
  api.food.listPeriods.mockResolvedValue(periods)
  api.food.listPeriodItems.mockImplementation(async (id: string) => (id === PERIOD.id ? structuredClone(items) : []))
  return renderWithApp(<FoodTrackingPage today={today} hour={hour} />, { api, route: '/plan', path: '/plan' })
}

const row = (id: string) => screen.getByTestId(`food-item-${id}`)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function captureRealtime(api: FakeApi) {
  let notify: () => void = () => undefined
  api.food.subscribe.mockImplementation((cb: () => void) => {
    notify = cb
    return () => undefined
  })
  return () => notify()
}

describe('FoodTrackingPage', () => {
  it('affiche la période en cours, le jour choisi et les quotas par moment', async () => {
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    expect(api.food.listPeriods).toHaveBeenCalledWith(LUCILE.id)
    expect(api.food.listPeriodItems).toHaveBeenCalledWith(PERIOD.id)
    expect(screen.getByText('Jour 6 sur 15')).toBeInTheDocument()
    expect(screen.getByLabelText('Période')).toHaveValue(PERIOD.id)
    expect(screen.getByRole('option', { name: '19 oct. → 2 nov. 2026 (en cours)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Lucile' })).toHaveAttribute('aria-checked', 'true')

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Petit-déjeuner',
      expect.stringMatching(/^Déjeuner1 noté$/),
      expect.stringMatching(/^Collation1 hors plan$/),
    ])
    expect(within(row('cafe')).getByText('· 250 ml')).toBeInTheDocument()
    expect(within(row('cafe')).getByText('0/7')).toBeInTheDocument()
    expect(within(row('yaourt')).getByText('2/2')).toBeInTheDocument()
    expect(within(row('fruit')).getByText('1/1')).toBeInTheDocument()
    expect(within(row('fruit')).getByText('+1 hors plan')).toBeInTheDocument()
    // Compteur du jour
    expect(within(row('yaourt')).getByText(/^1/)).toHaveTextContent('1 le 24 octobre')
  })

  it('affiche le jour de chaque consommation dans sa pastille', async () => {
    renderTracking()
    await screen.findByText('Samedi 24 octobre')
    const dots = within(row('fruit')).getByTitle('21 octobre').parentElement!
    expect([...dots.children].map((d) => [d.textContent, d.getAttribute('title')])).toEqual([
      ['21', '21 octobre'],
      ['22', '22 octobre'],
    ])
    expect(within(row('cafe')).getByText('0/7').previousElementSibling!.children).toHaveLength(7)
    expect(within(row('yaourt')).getByText('Noté les 20 octobre, 24 octobre.')).toBeInTheDocument()
    expect(within(row('cafe')).queryByText(/^Noté/)).not.toBeInTheDocument()
  })

  it('note une consommation le jour choisi, sans attendre le serveur', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    const pending = deferred<Consumption>()
    api.food.addConsumption.mockReturnValueOnce(pending.promise)

    await user.click(screen.getByRole('button', { name: 'Ajouter « Café au lait » (Petit-déjeuner)' }))
    expect(api.food.addConsumption).toHaveBeenCalledWith('cafe', TODAY)
    expect(within(row('cafe')).getByText('1/7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Petit-déjeuner1 noté/ })).toBeInTheDocument()
    // Pas encore enregistrée : « − » n'aurait rien à retirer
    expect(screen.getByRole('button', { name: 'Retirer « Café au lait » (Petit-déjeuner)' })).toBeDisabled()

    await act(async () => pending.resolve(c('new', TODAY)))
    expect(within(row('cafe')).getByText('1/7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer « Café au lait » (Petit-déjeuner)' })).toBeEnabled()
    // La consommation enregistrée peut être retirée
    await user.click(screen.getByRole('button', { name: 'Retirer « Café au lait » (Petit-déjeuner)' }))
    expect(api.food.removeConsumption).toHaveBeenCalledWith('new')
    expect(within(row('cafe')).getByText('0/7')).toBeInTheDocument()
  })

  it('au-delà du quota, la consommation est hors plan', async () => {
    const user = userEvent.setup()
    renderTracking()
    await screen.findByText('Samedi 24 octobre')
    const add = screen.getByRole('button', { name: 'Ajouter « Yaourt » (Déjeuner) (hors plan)' })
    expect(add).toHaveAttribute('title', 'Quota atteint : la consommation sera hors plan')
    await user.click(add)
    expect(within(row('yaourt')).getByText('+1 hors plan')).toBeInTheDocument()
    expect(within(row('yaourt')).getByText('2/2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Déjeuner2 notés1 hors plan/ })).toBeInTheDocument()
  })

  it('retire la dernière consommation du jour ; rien à retirer un jour sans consommation', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    expect(screen.getByRole('button', { name: 'Retirer « Café au lait » (Petit-déjeuner)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retirer « Yaourt » (Déjeuner)' }))
    expect(api.food.removeConsumption).toHaveBeenCalledWith('y2')
    expect(within(row('yaourt')).getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retirer « Yaourt » (Déjeuner)' })).toBeDisabled()
  })

  it('annule la mise à jour et prévient si le serveur refuse', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    api.food.addConsumption.mockRejectedValueOnce(new AppError('La date doit être comprise dans la période.'))
    await user.click(screen.getByRole('button', { name: 'Ajouter « Café au lait » (Petit-déjeuner)' }))
    expect(await screen.findByText('La date doit être comprise dans la période.')).toBeInTheDocument()
    expect(within(row('cafe')).getByText('0/7')).toBeInTheDocument()

    api.food.removeConsumption.mockRejectedValueOnce(new AppError('Connexion impossible.'))
    await user.click(screen.getByRole('button', { name: 'Retirer « Yaourt » (Déjeuner)' }))
    expect(await screen.findByText('Connexion impossible.')).toBeInTheDocument()
    expect(within(row('yaourt')).getByText('2/2')).toBeInTheDocument()
  })

  it('change de jour dans les limites de la période', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking({ today: '2026-10-20' })
    await screen.findByText('Mardi 20 octobre')
    await user.click(screen.getByRole('button', { name: 'Jour précédent' }))
    expect(screen.getByText('Lundi 19 octobre')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jour précédent' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Jour suivant' }))
    await user.click(screen.getByRole('button', { name: 'Jour suivant' }))
    expect(screen.getByText('Mercredi 21 octobre')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter « Fruit » (Collation) (hors plan)' }))
    expect(api.food.addConsumption).toHaveBeenCalledWith('fruit', '2026-10-21')

    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    expect(screen.getByText('Mardi 20 octobre')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aujourd’hui' })).not.toBeInTheDocument()
  })

  it('choisit directement la date d’une consommation notée en retard', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    const input = screen.getByLabelText('Date de saisie')
    expect(input).toHaveAttribute('min', PERIOD.start_date)
    expect(input).toHaveAttribute('max', PERIOD.end_date)
    fireEvent.change(input, { target: { value: '2026-10-20' } })
    expect(screen.getByText('Mardi 20 octobre')).toBeInTheDocument()
    expect(within(row('yaourt')).getByText(/^1/)).toHaveTextContent('1 le 20 octobre')
    await user.click(screen.getByRole('button', { name: 'Ajouter « Café au lait » (Petit-déjeuner)' }))
    expect(api.food.addConsumption).toHaveBeenCalledWith('cafe', '2026-10-20')

    // Une date hors période est ramenée dans la période ; un champ vidé est ignoré
    fireEvent.change(input, { target: { value: '2026-10-01' } })
    expect(screen.getByText('Lundi 19 octobre')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('Lundi 19 octobre')).toBeInTheDocument()
  })

  it('ne dépasse pas le dernier jour', async () => {
    const user = userEvent.setup()
    renderTracking({ today: '2026-11-02' })
    await screen.findByText('Lundi 2 novembre')
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Jour précédent' }))
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toBeEnabled()
  })

  it('replie et déplie un moment', async () => {
    const user = userEvent.setup()
    renderTracking()
    await screen.findByText('Samedi 24 octobre')
    await user.click(screen.getByRole('button', { name: /^Petit-déjeuner/ }))
    expect(screen.getByRole('button', { name: /^Petit-déjeuner/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('food-item-cafe')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Petit-déjeuner/ }))
    expect(row('cafe')).toBeInTheDocument()
  })

  it('affiche une autre période', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    api.food.listPeriodItems.mockResolvedValue([item({ id: 'old', name: 'Ancien aliment', allowed_occurrences: 3 })])
    await user.selectOptions(screen.getByLabelText('Période'), OLD.id)
    expect(await screen.findByText('Ancien aliment')).toBeInTheDocument()
    expect(api.food.listPeriodItems).toHaveBeenLastCalledWith(OLD.id)
    // Période passée : le jour affiché est son dernier jour
    expect(screen.getByText('Dimanche 18 octobre')).toBeInTheDocument()
    expect(screen.getByText('Jour 14 sur 14')).toBeInTheDocument()
  })

  it('suit la personne choisie', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    api.food.listPeriods.mockResolvedValue([])
    await user.click(screen.getByRole('radio', { name: 'Eric' }))
    expect(await screen.findByText('Aucune période')).toBeInTheDocument()
    expect(api.food.listPeriods).toHaveBeenLastCalledWith(ERIC.id)
    expect(screen.getAllByRole('link', { name: 'Modifier le plan' })[0]).toHaveAttribute('href', `/plan/modifier?profil=${ERIC.id}`)
  })

  it('crée la première période', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking({ periods: [] })
    expect(await screen.findByText('Aucune période')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Nouvelle période' })[1]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Début')).toHaveValue(TODAY)
    expect(within(dialog).getByLabelText('Fin (incluse)')).toHaveValue('2026-11-06')
    expect(within(dialog).getByText('14 jours')).toBeInTheDocument()

    api.food.listPeriods.mockResolvedValue([{ ...PERIOD, id: 'new-period', start_date: TODAY, end_date: '2026-11-06' }])
    api.food.listPeriodItems.mockResolvedValue(ITEMS)
    await user.click(within(dialog).getByRole('button', { name: 'Créer la période' }))
    expect(api.food.createPeriod).toHaveBeenCalledWith(LUCILE.id, TODAY, '2026-11-06')
    expect(await screen.findByText('Période créée')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Jour 1 sur 14')).toBeInTheDocument()
  })

  it('refuse une période qui chevauche, et affiche l’erreur du serveur', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    await user.click(screen.getByRole('button', { name: 'Nouvelle période' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Début')).toHaveValue('2026-11-03')
    await user.clear(within(dialog).getByLabelText('Début'))
    await user.type(within(dialog).getByLabelText('Début'), '2026-11-01')
    expect(within(dialog).getByText('Chevauche la période du 19 octobre au 2 novembre')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Créer la période' })).toBeDisabled()

    await user.clear(within(dialog).getByLabelText('Début'))
    await user.type(within(dialog).getByLabelText('Début'), '2026-11-03')
    api.food.createPeriod.mockRejectedValueOnce(new AppError("Le plan est vide : ajoute d'abord des aliments."))
    await user.click(within(dialog).getByRole('button', { name: 'Créer la période' }))
    expect(await screen.findByText("Le plan est vide : ajoute d'abord des aliments.")).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('rappelle la fin de période et propose de créer la suivante', async () => {
    const user = userEvent.setup()
    renderTracking({ today: '2026-10-31' })
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('La période se termine dans 2 jours : pense à préparer la suivante.')
    await user.click(within(banner).getByRole('button', { name: 'Créer' }))
    expect(await screen.findByRole('dialog', { name: 'Nouvelle période' })).toBeInTheDocument()
  })

  it('signale qu’aucune période n’est en cours', async () => {
    renderTracking({ today: '2026-11-10' })
    expect(await screen.findByRole('status')).toHaveTextContent('Aucune période en cours : crée la suivante.')
    // La période la plus récente est affichée
    expect(screen.getByText('Lundi 2 novembre')).toBeInTheDocument()
  })

  it('rappelle le soir que rien n’est noté aujourd’hui', async () => {
    const { unmount } = renderTracking({ today: '2026-10-25', hour: 21 })
    expect(await screen.findByRole('status')).toHaveTextContent('Rien de noté aujourd’hui.')
    unmount()
    renderTracking({ today: '2026-10-25', hour: 10 })
    await screen.findByText('Dimanche 25 octobre')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('pas de rappel du soir si une consommation est notée', async () => {
    renderTracking({ today: TODAY, hour: 21 })
    await screen.findByText('Samedi 24 octobre')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('supprime la période après confirmation', async () => {
    const user = userEvent.setup()
    const { api } = renderTracking()
    await screen.findByText('Samedi 24 octobre')
    await user.click(screen.getByRole('button', { name: 'Actions sur la période' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer la période' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('19 oct. → 2 nov. 2026 : toutes les consommations notées sur cette période seront perdues.')
    api.food.listPeriods.mockResolvedValue([OLD])
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    expect(api.food.deletePeriod).toHaveBeenCalledWith(PERIOD.id)
    expect(await screen.findByText('Période supprimée')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Période')).toHaveValue(OLD.id))
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.food.listPeriods.mockRejectedValueOnce(new AppError('Impossible de charger les périodes.'))
    renderTracking({ api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les périodes.')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Samedi 24 octobre')).toBeInTheDocument()
  })

  it('recharge en temps réel, mais pas pendant un enregistrement en cours', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const api = fakeApi()
      const notify = captureRealtime(api)
      renderTracking({ api })
      await screen.findByText('Samedi 24 octobre')
      const pending = deferred<Consumption>()
      api.food.addConsumption.mockReturnValueOnce(pending.promise)
      await user.click(screen.getByRole('button', { name: 'Ajouter « Café au lait » (Petit-déjeuner)' }))

      // Le serveur ne connaît pas encore la consommation : recharger maintenant l'effacerait.
      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(api.food.listPeriods).toHaveBeenCalledTimes(1)
      expect(within(row('cafe')).getByText('1/7')).toBeInTheDocument()

      const saved = c('saved', TODAY)
      api.food.listPeriodItems.mockResolvedValue(ITEMS.map((i) => (i.id === 'cafe' ? { ...i, consumptions: [saved, c('other', TODAY)] } : i)))
      await act(async () => pending.resolve(saved))
      await waitFor(() => expect(api.food.listPeriods).toHaveBeenCalledTimes(2))
      expect(await within(row('cafe')).findByText('2/7')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

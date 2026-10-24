import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import type { WeightEntry } from '@/lib/weights'
import { ERIC, LUCILE, fakeApi, renderWithApp } from '@/test/fakes'
import { WeightPage } from './WeightPage'

const TODAY = '2026-10-24'

const w = (profile_id: string, measured_on: string, weight_kg: number): WeightEntry => ({ id: `${profile_id}-${measured_on}`, profile_id, measured_on, weight_kg })

const ENTRIES = [
  w(LUCILE.id, '2025-06-01', 61.8),
  w(LUCILE.id, '2026-06-06', 60.9),
  w(ERIC.id, '2026-06-06', 71.8),
  w(LUCILE.id, '2026-08-27', 64.9),
  w(ERIC.id, '2026-08-27', 72.7),
  w(LUCILE.id, '2026-10-09', 65.0),
]

function renderWeights(entries: WeightEntry[] = ENTRIES, api = fakeApi()) {
  api.weights.listEntries.mockResolvedValue(entries)
  return renderWithApp(<WeightPage today={TODAY} />, { api, route: '/poids', path: '/poids' })
}

/** Clic sur le point d'une date (le SVG de test mesure 0 px : l'abscisse du clic est celle du point). */
async function clickPoint(date: string, offset = 0) {
  const chart = await screen.findByRole('img', { name: /Évolution du poids/ })
  const circle = chart.querySelector(`circle[data-date="${date}"]`)
  if (!circle) throw new Error(`Point introuvable : ${date}`)
  fireEvent.click(chart, { clientX: Number(circle.getAttribute('cx')) + offset })
}

describe('WeightPage', () => {
  it('résume la dernière pesée de chaque personne et les écarts', async () => {
    renderWeights()
    const lucile = await screen.findByRole('article', { name: 'Lucile' })
    expect(within(lucile).getByText('65,0 kg')).toBeInTheDocument()
    expect(within(lucile).getByText('9 octobre 2026 · il y a 15 j')).toBeInTheDocument()
    expect(within(lucile).getByText('+0,1 kg')).toBeInTheDocument()
    expect(within(lucile).getByText('vs pesée précédente')).toBeInTheDocument()
    expect(within(lucile).getByText('sur 1 an')).toBeInTheDocument()
    expect(within(lucile).getByText('+4,1 kg')).toBeInTheDocument()
    expect(within(lucile).getByText('Min 60,9 kg · Max 65,0 kg')).toBeInTheDocument()

    const eric = screen.getByRole('article', { name: 'Eric' })
    expect(within(eric).getByText('72,7 kg')).toBeInTheDocument()
  })

  it('rappelle de se peser après 20 jours sans pesée', async () => {
    renderWeights()
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent("C'est l'heure de se peser")
    expect(banner).toHaveTextContent('Eric : dernière pesée il y a 58 jours')
    expect(banner).not.toHaveTextContent('Lucile')
  })

  it('change de période : la synthèse et le graphique suivent', async () => {
    const user = userEvent.setup()
    renderWeights()
    const lucile = await screen.findByRole('article', { name: 'Lucile' })
    await user.click(screen.getByRole('radio', { name: '3 mois' }))
    expect(screen.getByRole('radio', { name: '3 mois' })).toHaveAttribute('aria-checked', 'true')
    expect(within(lucile).getByText('sur 3 mois')).toBeInTheDocument()
    expect(screen.getByTestId('series-u-lucile').querySelectorAll('circle')).toHaveLength(2)
    expect(screen.queryByTestId('series-u-eric')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Tout' }))
    expect(screen.getByTestId('series-u-lucile').querySelectorAll('circle')).toHaveLength(4)
  })

  it('affiche l’info-bulle de chaque personne au clavier sur le graphique', async () => {
    renderWeights()
    const chart = await screen.findByRole('img', { name: /Évolution du poids/ })
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    const tooltip = await screen.findByTestId('chart-tooltip')
    expect(tooltip).toHaveTextContent('9 octobre 2026')
    expect(tooltip).toHaveTextContent('65,0 kgLucile')
    expect(tooltip).toHaveTextContent('—Eric')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('27 août')
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('72,7 kgEric')
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('6 juin 2026')
    fireEvent.keyDown(chart, { key: 'End' })
    expect(screen.getByTestId('chart-tooltip')).toHaveTextContent('9 octobre')
    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument()
  })

  it('ouvre la pesée en cliquant sur un point du graphique, pas à côté', async () => {
    renderWeights()
    await clickPoint('2026-10-09', 60)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await clickPoint('2026-10-09', 10)
    const dialog = await screen.findByRole('dialog', { name: 'Modifier la pesée' })
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-09')
    expect(within(dialog).getByLabelText('Lucile')).toHaveValue('65,0')
    expect(within(dialog).getByLabelText('Eric')).toHaveValue('')
  })

  it('ouvre la pesée avec Entrée depuis le clavier', async () => {
    renderWeights()
    const chart = await screen.findByRole('img', { name: /Évolution du poids/ })
    act(() => chart.focus())
    fireEvent.keyDown(chart, { key: 'Enter' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'Enter' })
    const dialog = await screen.findByRole('dialog', { name: 'Modifier la pesée' })
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-08-27')
  })

  it('n’affiche ni import ni tableau d’historique', async () => {
    renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    expect(screen.queryByRole('button', { name: /Importer/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('ajoute une pesée pour les deux personnes', async () => {
    const user = userEvent.setup()
    const { api } = renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await user.click(screen.getByRole('button', { name: 'Nouvelle pesée' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nouvelle pesée' })
    expect(within(dialog).getByLabelText('Date')).toHaveValue(TODAY)
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Lucile'), '64,8')
    await user.type(within(dialog).getByLabelText('Eric'), '700')
    expect(within(dialog).getByText('Entre 20 et 300 kg')).toBeInTheDocument()
    expect(save).toBeDisabled()
    await user.clear(within(dialog).getByLabelText('Eric'))
    await user.type(within(dialog).getByLabelText('Eric'), '72.1')
    await user.click(save)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.weights.saveWeighIn).toHaveBeenCalledWith(
      TODAY,
      expect.arrayContaining([
        { profile_id: LUCILE.id, weight_kg: 64.8 },
        { profile_id: ERIC.id, weight_kg: 72.1 },
      ]),
      undefined,
    )
    expect(await screen.findByText('Pesée enregistrée')).toBeInTheDocument()
  })

  it('refuse une date future et préremplit une date déjà pesée', async () => {
    const user = userEvent.setup()
    renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await user.click(screen.getByRole('button', { name: 'Nouvelle pesée' }))
    const dialog = await screen.findByRole('dialog')
    const date = within(dialog).getByLabelText('Date')

    fireEvent.change(date, { target: { value: '2026-10-30' } })
    expect(within(dialog).getByText('La date ne peut pas être dans le futur')).toBeInTheDocument()

    fireEvent.change(date, { target: { value: '2026-08-27' } })
    expect(within(dialog).getByText('Une pesée existe déjà à cette date : tu la modifies.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Lucile')).toHaveValue('64,9')
    expect(within(dialog).getByLabelText('Eric')).toHaveValue('72,7')
  })

  it('modifie une pesée (avec changement de date) et efface le poids vidé', async () => {
    const user = userEvent.setup()
    const { api } = renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await clickPoint('2026-08-27')
    const dialog = await screen.findByRole('dialog', { name: 'Modifier la pesée' })
    expect(within(dialog).getByLabelText('Eric')).toHaveValue('72,7')

    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-08-28' } })
    await user.clear(within(dialog).getByLabelText('Eric'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(api.weights.saveWeighIn).toHaveBeenCalledWith(
        '2026-08-28',
        expect.arrayContaining([
          { profile_id: LUCILE.id, weight_kg: 64.9 },
          { profile_id: ERIC.id, weight_kg: null },
        ]),
        '2026-08-27',
      ),
    )
  })

  it('prévient qu’une pesée sera remplacée quand on déplace vers une date occupée', async () => {
    renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await clickPoint('2026-10-09')
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-08-27' } })
    expect(within(dialog).getByText(/existe déjà le jeudi 27 août : elle sera remplacée/)).toBeInTheDocument()
  })

  it('garde le formulaire ouvert si l’enregistrement échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.weights.saveWeighIn.mockRejectedValue(new AppError('Serveur indisponible'))
    renderWeights(ENTRIES, api)
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await user.click(screen.getByRole('button', { name: 'Nouvelle pesée' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Lucile'), '64')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Serveur indisponible')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('supprime une pesée après confirmation', async () => {
    const user = userEvent.setup()
    const { api } = renderWeights()
    await screen.findByRole('img', { name: /Évolution du poids/ })
    await clickPoint('2026-08-27')
    await user.click(within(await screen.findByRole('dialog', { name: 'Modifier la pesée' })).getByRole('button', { name: 'Supprimer' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Supprimer cette pesée ?' })
    expect(confirm).toHaveTextContent('Eric : 72,7 kg · Lucile : 64,9 kg')
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.weights.deleteWeighIn).toHaveBeenCalledWith('2026-08-27'))
  })

  it('affiche une erreur de chargement et permet de réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.weights.listEntries.mockRejectedValueOnce(new AppError('Hors ligne')).mockResolvedValue(ENTRIES)
    renderWithApp(<WeightPage today={TODAY} />, { api, route: '/poids', path: '/poids' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('img', { name: /Évolution du poids/ })).toBeInTheDocument()
  })

  it('ne vide pas le formulaire en cours de saisie quand les données sont rechargées', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.weights.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderWeights(ENTRIES, api)
      await screen.findByRole('img', { name: /Évolution du poids/ })
      await user.click(screen.getByRole('button', { name: 'Nouvelle pesée' }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Lucile'), '64,2')

      api.weights.listEntries.mockResolvedValue([...ENTRIES, w(ERIC.id, '2026-10-20', 72)])
      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      await waitFor(() => expect(api.weights.listEntries).toHaveBeenCalledTimes(2))
      expect(within(dialog).getByLabelText('Lucile')).toHaveValue('64,2')
    } finally {
      vi.useRealTimers()
    }
  })

  it('recharge quand l’autre personne se pèse', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = fakeApi()
      let notify: () => void = () => undefined
      api.weights.subscribe.mockImplementation((cb: () => void) => {
        notify = cb
        return () => undefined
      })
      renderWeights([], api)
      await screen.findByText('Aucune pesée')
      api.weights.listEntries.mockResolvedValue([w(ERIC.id, '2026-10-24', 71.9)])
      act(() => notify())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(await screen.findByRole('article', { name: 'Eric' })).toHaveTextContent('71,9 kg')
    } finally {
      vi.useRealTimers()
    }
  })
})

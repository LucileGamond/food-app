import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api/errors'
import type { UsageRow } from '@/lib/llmUsage'
import { ERIC, fakeApi, LUCILE, renderWithApp } from '@/test/fakes'
import { LlmUsageSettings } from './LlmUsageSettings'

const row = (overrides: Partial<UsageRow>): UsageRow => ({
  userId: LUCILE.id,
  function: 'knit-pattern',
  mode: 'ideas',
  model: 'claude-haiku-5-5',
  calls: 1,
  requests: 1,
  failures: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  webSearches: 0,
  ...overrides,
})

describe('LlmUsageSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('affiche les totaux du foyer, par fonctionnalité (avec ses modes) et par personne, pour ce mois par défaut', async () => {
    const api = fakeApi()
    api.llmUsage.summary.mockResolvedValue([
      row({ calls: 3, inputTokens: 2_000_000, outputTokens: 12_000, webSearches: 4 }),
      row({ mode: 'question', userId: ERIC.id, calls: 1, failures: 1, inputTokens: 500 }),
      row({ function: 'import-recipe', mode: 'photos', userId: ERIC.id, calls: 2, inputTokens: 1_000_000 }),
    ])
    renderWithApp(<LlmUsageSettings />, { api })

    const section = await screen.findByRole('region', { name: 'Consommation IA' })
    expect(api.llmUsage.summary).toHaveBeenCalledWith(new Date(2026, 10, 1), null)
    const total = await within(section).findByRole('group', { name: 'Foyer' })
    expect(total).toHaveTextContent('6 appels')
    expect(total).toHaveTextContent('1 échec')
    expect(total).toHaveTextContent('3 M')
    expect(total).toHaveTextContent('12 k')
    expect(total).toHaveTextContent('4 recherches web')
    expect(total).toHaveTextContent('0,30 €')

    const features = within(section).getByRole('list', { name: 'Par fonctionnalité' })
    expect(within(features).getByText('Tricot')).toBeInTheDocument()
    expect(within(features).getByText('Idées de modèles')).toBeInTheDocument()
    expect(within(features).getByText('Question')).toBeInTheDocument()
    expect(within(features).getByText('Import de recette')).toBeInTheDocument()
    expect(within(features).getByText('Photos')).toBeInTheDocument()

    const people = within(section).getByRole('list', { name: 'Par personne' })
    await within(people).findByText('Lucile')
    expect(within(people).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Lucile'), expect.stringContaining('Eric')])
  })

  it('change de période', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { api } = renderWithApp(<LlmUsageSettings />)
    await screen.findByText('Aucun appel sur cette période.')
    await user.selectOptions(screen.getByLabelText('Période'), 'Le mois dernier')
    expect(api.llmUsage.summary).toHaveBeenLastCalledWith(new Date(2026, 9, 1), new Date(2026, 10, 1))
    await user.selectOptions(screen.getByLabelText('Période'), 'Tout (12 mois max.)')
    expect(api.llmUsage.summary).toHaveBeenLastCalledWith(null, null)
  })

  it('signale un coût partiel et une erreur de chargement', async () => {
    const api = fakeApi()
    api.llmUsage.summary.mockResolvedValueOnce([row({ model: 'modele-inconnu', inputTokens: 10 })])
    renderWithApp(<LlmUsageSettings />, { api })
    expect(await screen.findByText(/sans tarif connu/)).toBeInTheDocument()

    const failing = fakeApi()
    failing.llmUsage.summary.mockRejectedValue(new AppError('Impossible de charger la consommation.'))
    renderWithApp(<LlmUsageSettings />, { api: failing })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la consommation.')
  })
})

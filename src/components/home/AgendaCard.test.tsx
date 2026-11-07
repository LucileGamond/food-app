import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { DEFAULT_SETTINGS } from '@/lib/settings'
import { HomePage } from '@/pages/HomePage'
import { ERIC_SOURCE, eventFixture, sourceFixture } from '@/test/agenda'
import { ERIC, fakeApi, renderWithApp } from '@/test/fakes'

const TODAY = '2026-11-10'

function setup(options: { events?: ReturnType<typeof eventFixture>[]; sources?: ReturnType<typeof sourceFixture>[]; scope?: 'mine' | 'other' | 'all'; api?: ReturnType<typeof fakeApi> } = {}) {
  const api = options.api ?? fakeApi()
  // Seule la page Agenda est affichée : l'accueil n'a que cette carte.
  api.settings.getSettings.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    disabledPages: ['planning', 'recettes', 'plan', 'courses', 'poids', 'hydratation', 'tricot', 'plantes'],
    agendaScope: options.scope ?? 'all',
  })
  api.agenda.listSources.mockResolvedValue(options.sources ?? [sourceFixture(), ERIC_SOURCE])
  if (options.events) api.agenda.listEvents.mockResolvedValue(options.events)
  return renderWithApp(<HomePage today={TODAY} />, { api })
}

const card = () => screen.findByRole('region', { name: 'Rendez-vous' })

describe('Accueil — carte Rendez-vous', () => {
  it('les rendez-vous du jour, des agendas choisis', async () => {
    const user = userEvent.setup()
    const { api } = setup({
      events: [
        eventFixture({ id: 'a', title: 'Dentiste' }),
        eventFixture({ id: 'b', title: 'Réunion', ownerId: ERIC.id, ownerName: 'Eric', startsAt: '2026-11-10T14:00:00Z', endsAt: '2026-11-10T15:00:00Z' }),
        eventFixture({ id: 'c', title: 'Demain', startsAt: '2026-11-11T08:00:00Z', endsAt: '2026-11-11T09:00:00Z' }),
      ],
    })
    const list = await within(await card()).findByRole('list', { name: 'Rendez-vous du jour' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['9 h – 10 hDentiste', '15 h – 16 hRéunionEric'])
    expect(api.agenda.listEvents).toHaveBeenCalledWith(TODAY, TODAY)

    await waitFor(() => expect(screen.getByRole('radio', { name: 'Moi' })).toBeEnabled())
    await user.click(screen.getByRole('radio', { name: 'Moi' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    await waitFor(() => expect(api.settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ agendaScope: 'mine' })))
    expect(within(await card()).getByRole('link', { name: 'Semaine' })).toHaveAttribute('href', '/agenda')
  })

  it('réglage enregistré : seulement l’agenda de l’autre', async () => {
    setup({ scope: 'other', events: [eventFixture({ title: 'Dentiste' })] })
    expect(await within(await card()).findByText('Aucun rendez-vous aujourd’hui.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Eric' })).toHaveAttribute('aria-checked', 'true')
  })

  it('au-delà de 5 rendez-vous, le nombre des suivants', async () => {
    const events = Array.from({ length: 7 }, (_, i) => eventFixture({ id: `e${i}`, title: `Rdv ${i}`, startsAt: `2026-11-10T1${i}:00:00Z`, endsAt: `2026-11-10T1${i}:30:00Z` }))
    setup({ events })
    expect(await within(await card()).findByText('et 2 autres')).toBeInTheDocument()
  })

  it('aucun agenda suivi : lien pour en ajouter un', async () => {
    setup({ sources: [] })
    expect(await within(await card()).findByText(/Aucun agenda suivi/)).toBeInTheDocument()
    expect(within(await card()).getByRole('link', { name: 'Ajouter' })).toHaveAttribute('href', '/agenda/sources')
  })

  it('erreur de chargement', async () => {
    const api = fakeApi()
    api.agenda.listEvents.mockRejectedValue(new AppError('Impossible de charger l’agenda.'))
    setup({ api })
    expect(await within(await card()).findByText('Impossible de charger l’agenda.')).toBeInTheDocument()
  })
})

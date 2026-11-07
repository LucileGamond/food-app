import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { ERIC_SOURCE, sourceFixture } from '@/test/agenda'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { AgendaSourcesPage } from './AgendaSourcesPage'

const TODAY = '2026-11-10'
const SECRET_URL = 'https://calendar.google.com/calendar/ical/lucile%40gmail.com/private-abc/basic.ics'

function setup(sources = [sourceFixture(), ERIC_SOURCE, sourceFixture({ id: 's-anniv', name: 'Anniversaires', lastSyncedAt: null }), sourceFixture({ id: 's-ko', name: 'Ancien', lastError: 'Agenda introuvable.' })]) {
  const api = fakeApi()
  api.agenda.listSources.mockResolvedValue(sources)
  return renderWithApp(<AgendaSourcesPage today={TODAY} />, { api, route: '/agenda/sources', path: '/agenda/sources' })
}

const item = (name: RegExp) => within(screen.getByRole('list', { name: 'Agendas suivis' })).getAllByRole('listitem').find((li) => name.test(li.textContent ?? ''))!

describe('AgendaSourcesPage', () => {
  it('les agendas du foyer, leur propriétaire et leur synchronisation', async () => {
    setup()
    await screen.findByRole('list', { name: 'Agendas suivis' })
    expect(item(/Perso/)).toHaveTextContent('Perso · moi')
    expect(item(/Perso/)).toHaveTextContent('Synchronisé à 8 h 45')
    expect(item(/Travail/)).toHaveTextContent('Travail · Eric')
    expect(item(/Anniversaires/)).toHaveTextContent('En attente de synchronisation')
    expect(item(/Ancien/)).toHaveTextContent('Agenda introuvable.')
    // Seul le propriétaire peut ne plus suivre un agenda
    expect(within(item(/Perso/)).getByRole('button', { name: 'Ne plus suivre Perso' })).toBeInTheDocument()
    expect(within(item(/Travail/)).queryByRole('button')).not.toBeInTheDocument()
  })

  it('synchronisation d’un autre jour : sa date', async () => {
    setup([sourceFixture({ lastSyncedAt: '2026-11-03T10:00:00Z' })])
    expect(await screen.findByText('Synchronisé le 3 novembre')).toBeInTheDocument()
  })

  it('ajouter un agenda : vérifie l’adresse, l’ajoute et le synchronise', async () => {
    const user = userEvent.setup()
    const { api } = setup([])
    expect(await screen.findByText('Aucun agenda suivi pour l’instant.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Adresse secrète au format iCal'), 'https://calendar.google.com/calendar/embed?src=lucile')
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('adresse secrète au format iCal')
    expect(api.agenda.addIcalSource).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Nom'))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Donne un nom à cet agenda.')

    await user.type(screen.getByLabelText('Nom'), 'Perso')
    await user.clear(screen.getByLabelText('Adresse secrète au format iCal'))
    await user.type(screen.getByLabelText('Adresse secrète au format iCal'), SECRET_URL.replace('https://', 'webcal://'))
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    await waitFor(() => expect(api.agenda.addIcalSource).toHaveBeenCalledWith('Perso', SECRET_URL))
    expect(api.agenda.syncNow).toHaveBeenCalled()
    expect(await screen.findByText('Agenda « Perso » ajouté')).toBeInTheDocument()
    expect(screen.getByLabelText('Adresse secrète au format iCal')).toHaveValue('')
  })

  it('ajout refusé : le message, l’adresse reste saisie', async () => {
    const user = userEvent.setup()
    const { api } = setup([])
    api.agenda.addIcalSource.mockRejectedValueOnce(new AppError('Adresse ou nom refusé.'))
    await user.type(await screen.findByLabelText('Adresse secrète au format iCal'), SECRET_URL)
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByText('Adresse ou nom refusé.')).toBeInTheDocument()
    expect(screen.getByLabelText('Adresse secrète au format iCal')).toHaveValue(SECRET_URL)
  })

  it('ne plus suivre un agenda, après confirmation', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Ne plus suivre Perso' }))
    await user.click(screen.getByRole('button', { name: 'Ne plus suivre' }))
    await waitFor(() => expect(api.agenda.deleteSource).toHaveBeenCalledWith('s-lucile'))
    expect(await screen.findByText('Agenda « Perso » supprimé')).toBeInTheDocument()
  })

  it('synchroniser tout de suite', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await user.click(await screen.findByRole('button', { name: 'Synchroniser' }))
    await waitFor(() => expect(api.agenda.syncNow).toHaveBeenCalled())
    api.agenda.syncNow.mockRejectedValueOnce(new AppError('Synchronisation impossible pour le moment.'))
    await user.click(screen.getByRole('button', { name: 'Synchroniser' }))
    expect(await screen.findByText('Synchronisation impossible pour le moment.')).toBeInTheDocument()
  })

  it('erreur de chargement : réessayer', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.agenda.listSources.mockRejectedValueOnce(new AppError('Impossible de charger les agendas.'))
    renderWithApp(<AgendaSourcesPage today={TODAY} />, { api, route: '/agenda/sources', path: '/agenda/sources' })
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Aucun agenda suivi pour l’instant.')).toBeInTheDocument()
  })
})

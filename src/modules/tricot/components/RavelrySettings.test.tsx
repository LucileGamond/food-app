import { screen, waitFor } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { leaveFor, ravelryRedirectUri, RAVELRY_CALLBACK_PATH } from '../lib/ravelry'
import { RavelryCallbackPage } from '../pages/RavelryCallbackPage'
import { RavelrySettings } from './RavelrySettings'

describe('adresse de retour Ravelry', () => {
  it('page /reglages/ravelry de l’application', () => {
    expect(RAVELRY_CALLBACK_PATH).toBe('/reglages/ravelry')
    expect(ravelryRedirectUri('https://life.exemple')).toBe('https://life.exemple/reglages/ravelry')
    expect(ravelryRedirectUri()).toBe(`${window.location.origin}/reglages/ravelry`)
  })
})

describe('Réglages : compte Ravelry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('non relié : « Relier » demande l’adresse d’autorisation et y va', async () => {
    const go = vi.spyOn(leaveFor, 'go').mockImplementation(() => {})
    const user = setupUser()
    const api = fakeApi()
    renderWithApp(<RavelrySettings />, { api })
    await user.click(await screen.findByRole('button', { name: 'Relier mon compte Ravelry' }))
    expect(api.knitting.startRavelryConnect).toHaveBeenCalledWith(`${window.location.origin}/reglages/ravelry`)
    await waitFor(() => expect(go).toHaveBeenCalledWith('https://auth.ravelry.com/oauth2/auth?state=s'))
    // En partance : bouton occupé
    expect(screen.getByRole('button', { name: 'Relier mon compte Ravelry' })).toBeDisabled()
  })

  it('erreur au début de la connexion : message, bouton à nouveau disponible', async () => {
    const go = vi.spyOn(leaveFor, 'go').mockImplementation(() => {})
    const user = setupUser()
    const api = fakeApi()
    api.knitting.startRavelryConnect.mockRejectedValue(new AppError('La connexion à Ravelry n’est pas configurée.'))
    renderWithApp(<RavelrySettings />, { api })
    await user.click(await screen.findByRole('button', { name: 'Relier mon compte Ravelry' }))
    expect(await screen.findByText('La connexion à Ravelry n’est pas configurée.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Relier mon compte Ravelry' })).toBeEnabled()
    expect(go).not.toHaveBeenCalled()
  })

  it('relié : nom du compte, puis « Délier »', async () => {
    const user = setupUser()
    const api = fakeApi()
    api.knitting.getRavelryAccount.mockResolvedValueOnce({ username: 'lucile_tricote' }).mockResolvedValue(null)
    renderWithApp(<RavelrySettings />, { api })
    expect(await screen.findByText('lucile_tricote')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Délier' }))
    expect(api.knitting.disconnectRavelry).toHaveBeenCalled()
    expect(await screen.findByText('Compte Ravelry délié')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Relier mon compte Ravelry' })).toBeInTheDocument()
  })

  it('délier en échec : message, compte toujours affiché', async () => {
    const user = setupUser()
    const api = fakeApi()
    api.knitting.getRavelryAccount.mockResolvedValue({ username: 'lucile_tricote' })
    api.knitting.disconnectRavelry.mockRejectedValue(new AppError('Impossible de délier le compte Ravelry.'))
    renderWithApp(<RavelrySettings />, { api })
    await user.click(await screen.findByRole('button', { name: 'Délier' }))
    expect(await screen.findByText('Impossible de délier le compte Ravelry.')).toBeInTheDocument()
    expect(screen.getByText('lucile_tricote')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Délier' })).toBeEnabled()
  })

  it('compte illisible : erreur affichée', async () => {
    const api = fakeApi()
    api.knitting.getRavelryAccount.mockRejectedValue(new AppError('Impossible de savoir si Ravelry est relié.'))
    renderWithApp(<RavelrySettings />, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de savoir si Ravelry est relié.')
  })
})

describe('retour de Ravelry', () => {
  const settings = <Route path="/reglages" element={<p>Page Réglages</p>} />
  const render = (search: string, api = fakeApi()) => {
    renderWithApp(<RavelryCallbackPage />, { api, route: `/reglages/ravelry${search}`, path: '/reglages/ravelry', extraRoutes: settings })
    return api
  }

  it('relie le compte une seule fois, puis revient aux Réglages', async () => {
    const api = render('?code=le-code&state=etat')
    expect(screen.getByRole('status')).toHaveTextContent('Connexion du compte Ravelry…')
    expect(await screen.findByText('Page Réglages')).toBeInTheDocument()
    expect(await screen.findByText('Compte Ravelry relié : lucile_tricote')).toBeInTheDocument()
    expect(api.knitting.finishRavelryConnect).toHaveBeenCalledTimes(1)
    expect(api.knitting.finishRavelryConnect).toHaveBeenCalledWith('le-code', 'etat')
  })

  it('connexion refusée sur Ravelry : message, pas d’appel', async () => {
    const api = render('?error=access_denied&state=etat')
    expect(screen.getByRole('alert')).toHaveTextContent('Connexion à Ravelry annulée.')
    expect(screen.getByRole('link', { name: 'Retour aux Réglages' })).toHaveAttribute('href', '/reglages')
    expect(api.knitting.finishRavelryConnect).not.toHaveBeenCalled()
  })

  it('réponse incomplète : message, pas d’appel', () => {
    const api = render('?code=le-code')
    expect(screen.getByRole('alert')).toHaveTextContent('Réponse de Ravelry incomplète.')
    expect(api.knitting.finishRavelryConnect).not.toHaveBeenCalled()
  })

  it('échec de la liaison : message lisible', async () => {
    const api = fakeApi()
    api.knitting.finishRavelryConnect.mockRejectedValue(new AppError('Connexion à Ravelry expirée : recommence.'))
    render('?code=c&state=s', api)
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion à Ravelry expirée : recommence.')
  })
})

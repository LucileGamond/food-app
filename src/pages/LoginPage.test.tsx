import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'react-router-dom'
import { RequireAuth } from '@/auth/RequireAuth'
import { fakeAuth, renderWithApp } from '@/test/fakes'
import { LoginPage } from './LoginPage'

function renderLogin(auth = fakeAuth({ signedIn: false })) {
  return renderWithApp(<LoginPage />, {
    auth,
    route: '/login',
    path: '/login',
    extraRoutes: (
      <Route element={<RequireAuth />}>
        <Route path="/planning" element={<p>Écran planning</p>} />
      </Route>
    ),
  })
}

describe('LoginPage', () => {
  it('n’affiche pas de lien d’inscription et désactive le bouton tant que les champs sont vides', async () => {
    renderLogin()
    const button = await screen.findByRole('button', { name: 'Se connecter' })
    expect(button).toBeDisabled()
    expect(screen.queryByText(/inscri|créer un compte/i)).not.toBeInTheDocument()
  })

  it('affiche une erreur avec un mauvais mot de passe', async () => {
    const user = userEvent.setup()
    const { auth } = renderLogin()
    await user.type(await screen.findByLabelText('E-mail'), ' lucile@food.test ')
    await user.type(screen.getByLabelText('Mot de passe'), 'faux')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.')
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'lucile@food.test', password: 'faux' })
  })

  it('connecte puis redirige vers le planning', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.type(await screen.findByLabelText('E-mail'), 'lucile@food.test')
    await user.type(screen.getByLabelText('Mot de passe'), 'bon-mot-de-passe')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
  })

  it('redirige directement si déjà connecté', async () => {
    renderLogin(fakeAuth({ signedIn: true }))
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
  })

  it('affiche un message générique en cas de panne du serveur ou du réseau', async () => {
    const user = userEvent.setup()
    const auth = fakeAuth({ signedIn: false })
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { status: 500, message: 'boom' } })
    auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderLogin(auth)
    await user.type(await screen.findByLabelText('E-mail'), 'a@b.c')
    await user.type(screen.getByLabelText('Mot de passe'), 'x')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion impossible pour le moment')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vérifie ta connexion internet'))
  })
})

describe('RequireAuth', () => {
  it('renvoie vers la connexion si personne n’est connecté', async () => {
    renderWithApp(<p>Écran connexion</p>, {
      auth: fakeAuth({ signedIn: false }),
      route: '/planning',
      path: '/login',
      extraRoutes: (
        <Route element={<RequireAuth />}>
          <Route path="/planning" element={<p>Secret</p>} />
        </Route>
      ),
    })
    expect(await screen.findByText('Écran connexion')).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
  })
})

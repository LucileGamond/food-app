import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Api } from '@/api'
import { fakeApi, fakeAuth } from '@/test/fakes'
import { App } from './App'

function renderApp(route: string, auth = fakeAuth()) {
  const api = fakeApi()
  render(
    <MemoryRouter initialEntries={[route]}>
      <App api={api as unknown as Api} auth={auth} />
    </MemoryRouter>,
  )
  return { api, auth }
}

describe('App', () => {
  it('affiche la navigation Planning / Recettes et le nom de l’utilisateur', async () => {
    const user = userEvent.setup()
    renderApp('/planning')
    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument()
    expect(await screen.findByText('Lucile')).toBeInTheDocument()

    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!
    await user.click(within(nav).getByRole('link', { name: 'Recettes' }))
    expect(await screen.findByRole('heading', { name: 'Recettes' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Recettes' })).toHaveAttribute('aria-current', 'page')
  })

  it('déconnecte et revient à l’écran de connexion', async () => {
    const user = userEvent.setup()
    const { auth } = renderApp('/planning')
    await screen.findByRole('heading', { name: 'Planning' })
    await user.click(screen.getAllByRole('button', { name: 'Se déconnecter' })[0]!)
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('redirige les adresses inconnues vers le planning', async () => {
    renderApp('/nimporte-quoi')
    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument()
  })

  it('protège les écrans quand personne n’est connecté', async () => {
    renderApp('/recettes', fakeAuth({ signedIn: false }))
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
  })
})

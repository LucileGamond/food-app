import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Api } from '@/api'
import { DEFAULT_SETTINGS } from '@/lib/settings'
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
    // Page chargée à la demande : plus lente sous la mesure de couverture.
    expect(await screen.findByRole('heading', { name: 'Recettes' }, { timeout: 5000 })).toBeInTheDocument()
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

  it('n’affiche que les pages choisies dans les réglages, et redirige depuis une page masquée', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: ['planning', 'poids', 'hydratation'] })
    render(
      <MemoryRouter initialEntries={['/planning']}>
        <App api={api as unknown as Api} auth={fakeAuth()} />
      </MemoryRouter>,
    )
    // Accueil : la première page affichée
    expect(await screen.findByRole('heading', { name: 'Recettes' })).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!
    expect(within(nav).queryByRole('link', { name: 'Planning' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Eau' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Courses' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Réglages' })[0]).toHaveAttribute('href', '/reglages')
  })

  it('ouvre le suivi d’hydratation une fois activé', async () => {
    const user = userEvent.setup()
    const { api } = renderApp('/reglages')
    await user.click((await screen.findAllByRole('checkbox', { name: 'Eau' }))[0]!)
    expect(api.settings.saveSettings).toHaveBeenCalled()
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!
    await user.click(within(nav).getByRole('link', { name: 'Eau' }))
    expect(await screen.findByRole('heading', { name: 'Eau' })).toBeInTheDocument()
  })

  it('réglages illisibles : toutes les pages restent affichées, rien n’est masqué', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockRejectedValue(new Error('réseau'))
    render(
      <MemoryRouter initialEntries={['/tricot']}>
        <App api={api as unknown as Api} auth={fakeAuth()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Tricot' })).toBeInTheDocument()
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!
    expect(await within(nav).findByRole('link', { name: 'Eau' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Tricot' })).toBeInTheDocument()
  })

  it('une page masquée renvoie à l’accueil en le disant, mode cuisine compris', async () => {
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: ['recettes'] })
    render(
      <MemoryRouter initialEntries={['/recettes/r1/cuisiner']}>
        <App api={api as unknown as Api} auth={fakeAuth()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Planning' })).toBeInTheDocument()
    expect(await screen.findByText('« Recettes » est masquée dans tes réglages')).toBeInTheDocument()
    expect(api.recipes.getRecipe).not.toHaveBeenCalled()
  })

  it('téléphone : 5 onglets au plus, les autres pages dans « Plus »', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.settings.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, disabledPages: [] })
    render(
      <MemoryRouter initialEntries={['/planning']}>
        <App api={api as unknown as Api} auth={fakeAuth()} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Planning' })
    // Barre latérale (ordinateur) puis onglets (téléphone)
    const [sidebar, tabs] = screen.getAllByRole('navigation', { name: 'Navigation principale' })
    expect(await within(sidebar!).findAllByRole('link')).toHaveLength(8)
    expect(within(tabs!).getAllByRole('link').map((l) => l.textContent)).toEqual(['Planning', 'Recettes', 'Plan', 'Courses'])
    await user.click(within(tabs!).getByRole('button', { name: 'Plus' }))
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent?.trim())).toEqual(['Poids', 'Eau', 'Tricot', 'Plantes'])
    await user.click(screen.getByRole('menuitem', { name: 'Eau' }))
    expect(await screen.findByRole('heading', { name: 'Eau' })).toBeInTheDocument()
  })

  it('protège les écrans quand personne n’est connecté', async () => {
    renderApp('/recettes', fakeAuth({ signedIn: false }))
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
  })
})

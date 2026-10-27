import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppError, type Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider } from '@/auth/AuthProvider'
import type { RecipeSummary } from '@/lib/meals'
import type { Recipe } from '@/lib/recipes'
import { fakeApi, fakeAuth, type FakeApi } from '@/test/fakes'
import { RecipeDetailPage } from './RecipeDetailPage'
import { RecipeFormPage } from './RecipeFormPage'

vi.mock('@/lib/image', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  compressImage: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
  compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
}))

// Identifiant au format de la base (vérifié à l'ouverture du formulaire d'une sous-recette).
const PARENT = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f'

const TARTE: Recipe = {
  id: PARENT,
  is_saved: true,
  title: 'Tarte à la banane',
  notes: null,
  url: null,
  servings: 6,
  tags: [],
  source: 'Pâtisserie maison, p. 146',
  ingredients: [
    { name: 'pâte sucrée', quantity: 200, unit: 'g', note: 'voir p. 208' },
    { name: 'bananes', quantity: 5, unit: null, note: null },
    { name: 'streusel', quantity: null, unit: null, note: 'voir p. 40' },
  ],
  photos: [],
}

const summary = (id: string, title: string): RecipeSummary => ({ id, is_saved: true, title, notes: null, url: null, tags: [] })

function renderApp(api: FakeApi, entry: InitialEntry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={fakeAuth()}>
          <Routes>
            <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
            <Route path="/recettes/:id/modifier" element={<RecipeFormPage />} />
            <Route path="/recettes/:id" element={<RecipeDetailPage />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
  )
}

describe('recettes liées', () => {
  it('après l’enregistrement, propose d’importer les recettes auxquelles elle renvoie', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockImplementation(async (id: string) => (id === PARENT ? TARTE : null))
    renderApp(api, { pathname: `/recettes/${PARENT}`, state: { offerLinks: true } })

    const offer = await screen.findByRole('dialog', { name: 'Recettes liées' })
    expect(within(within(offer).getByRole('list', { name: 'Recettes à importer' })).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('pâte sucrée · p. 208'),
      expect.stringContaining('streusel · p. 40'),
    ])
    await user.click(within(offer).getByRole('button', { name: 'Importer pâte sucrée' }))

    // Formulaire de la sous-recette : titre et source préremplis, rattachée à la tarte
    expect(await screen.findByRole('heading', { name: 'Nouvelle recette' })).toBeInTheDocument()
    expect(screen.getByLabelText('Titre', { exact: true })).toHaveValue('Pâte sucrée')
    await waitFor(() => expect(screen.getByLabelText('Source')).toHaveValue('Pâtisserie maison, p. 208'))
    expect(screen.getByRole('note')).toHaveTextContent('Recette de « pâte sucrée » (p. 208) pour « Tarte à la banane » : elle y sera liée à l’enregistrement.')
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', `/recettes/${PARENT}`)

    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'farine')
    api.recipes.saveRecipe.mockResolvedValue('r2')
    api.recipes.getRecipe.mockImplementation(async (id: string) =>
      id === PARENT ? { ...TARTE, ingredients: TARTE.ingredients.map((i, n) => (n === 0 ? { ...i, linkedRecipe: { id: 'r2', title: 'Pâte sucrée' } } : i)) } : null,
    )
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Recette enregistrée et liée à « Tarte à la banane »')).toBeInTheDocument()
    expect(api.recipes.linkIngredient).toHaveBeenCalledWith(PARENT, expect.objectContaining({ position: 0, name: 'pâte sucrée' }), 'r2')
    // De retour sur la tarte : le renvoi restant est encore proposé…
    const offer2 = await screen.findByRole('dialog', { name: 'Recettes liées' })
    expect(within(offer2).getAllByRole('listitem').map((i) => i.textContent)).toEqual([expect.stringContaining('streusel · p. 40')])
    await user.click(within(offer2).getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // … le lien est affiché, et le renvoi restant reste disponible sur la fiche
    expect(screen.getByRole('link', { name: 'Recette : Pâte sucrée' })).toHaveAttribute('href', '/recettes/r2')
    expect(screen.getByRole('button', { name: 'Importer streusel' })).toBeInTheDocument()
  })

  it('propose les recettes liées dès l’enregistrement d’une nouvelle recette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.saveRecipe.mockResolvedValue(PARENT)
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    renderApp(api, '/recettes/nouvelle')
    await user.type(await screen.findByLabelText('Titre', { exact: true }), 'Tarte à la banane')
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'pâte sucrée')
    await user.type(screen.getByLabelText("Précision de l'ingrédient 1"), 'voir p. 208')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('dialog', { name: 'Recettes liées' })).toBeInTheDocument()
  })

  it('lie un renvoi à une recette déjà enregistrée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    api.recipes.listSavedSummaries.mockResolvedValue([summary(PARENT, 'Tarte à la banane'), summary('r3', 'Pâte sucrée maison'), summary('r4', 'Crumble')])
    renderApp(api, `/recettes/${PARENT}`)

    // Pas de fenêtre en arrivant sur la fiche : les renvois sont proposés sur chaque ingrédient
    await screen.findByRole('heading', { name: 'Tarte à la banane' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lier pâte sucrée à une recette existante' }))

    const dialog = await screen.findByRole('dialog', { name: 'Lier à une recette' })
    expect(dialog).toHaveTextContent('« pâte sucrée » (p. 208) renvoie à quelle recette ?')
    const choices = await within(dialog).findAllByRole('radio')
    expect(choices.map((c) => c.closest('label')!.textContent)).toEqual(['Pâte sucrée maison', 'Crumble'])
    expect(within(dialog).getByRole('button', { name: 'Lier' })).toBeDisabled()
    await user.click(within(dialog).getByText('Pâte sucrée maison'))
    await user.click(within(dialog).getByRole('button', { name: 'Lier' }))

    expect(api.recipes.linkIngredient).toHaveBeenCalledWith(PARENT, expect.objectContaining({ position: 0, name: 'pâte sucrée' }), 'r3')
    expect(await screen.findByRole('link', { name: 'Recette : Pâte sucrée maison' })).toHaveAttribute('href', '/recettes/r3')
    expect(screen.queryByRole('button', { name: 'Lier pâte sucrée à une recette existante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Lier à une recette' })).not.toBeInTheDocument()
  })

  it('garde la fenêtre ouverte si le lien échoue', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    api.recipes.listSavedSummaries.mockResolvedValue([summary('r3', 'Pâte sucrée maison')])
    api.recipes.linkIngredient.mockRejectedValue(new AppError('Recette liée introuvable'))
    renderApp(api, `/recettes/${PARENT}`)
    await user.click(await screen.findByRole('button', { name: 'Lier pâte sucrée à une recette existante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Lier à une recette' })
    await user.click(await within(dialog).findByText('Pâte sucrée maison'))
    await user.click(within(dialog).getByRole('button', { name: 'Lier' }))
    expect(await screen.findByText('Recette liée introuvable')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })

  it('depuis le formulaire de la sous-recette, lie une recette du même nom au lieu d’en créer une', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    api.recipes.listSavedSummaries.mockResolvedValue([summary(PARENT, 'Tarte à la banane'), summary('r3', 'Pâte sucrée')])
    renderApp(api, `/recettes/nouvelle?lier=${PARENT}&ingredient=0&nom=p%C3%A2te+sucr%C3%A9e&page=p.+208`)

    await user.click(await screen.findByRole('button', { name: 'Lier à « Pâte sucrée » sans créer de recette' }))
    expect(api.recipes.linkIngredient).toHaveBeenCalledWith(PARENT, expect.objectContaining({ position: 0, name: 'pâte sucrée' }), 'r3')
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()
    expect(await screen.findByText('« Pâte sucrée » liée à « Tarte à la banane »')).toBeInTheDocument()
    // Retour sur la tarte, qui propose les autres renvois
    expect(await screen.findByRole('dialog', { name: 'Recettes liées' })).toBeInTheDocument()
  })

  it('enregistre la recette même si le lien échoue, et le renvoi reste proposé', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(TARTE)
    api.recipes.linkIngredient.mockRejectedValue(new AppError('Ingrédient introuvable'))
    renderApp(api, `/recettes/nouvelle?lier=${PARENT}&ingredient=0&nom=p%C3%A2te+sucr%C3%A9e&page=p.+208`)
    await user.type(await screen.findByLabelText("Nom de l'ingrédient 1"), 'farine')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Recette enregistrée, mais pas liée : Ingrédient introuvable')).toBeInTheDocument()
    expect(api.recipes.saveRecipe).toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Recettes liées' })).toBeInTheDocument()
  })

  it('devient une recette comme une autre si la recette principale a été supprimée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue(null)
    api.recipes.saveRecipe.mockResolvedValue('r2')
    renderApp(api, `/recettes/nouvelle?lier=${PARENT}&ingredient=0&nom=p%C3%A2te+sucr%C3%A9e&page=p.+208`)
    expect(await screen.findByLabelText('Titre', { exact: true })).toHaveValue('Pâte sucrée')
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument())
    await user.type(screen.getByLabelText("Nom de l'ingrédient 1"), 'farine')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect((await screen.findAllByText('Recette enregistrée')).length).toBeGreaterThan(0)
    expect(api.recipes.linkIngredient).not.toHaveBeenCalled()
  })

  it('ouvre une recette liée depuis la fenêtre de suppression, sans la garder ouverte', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const pate: Recipe = { ...TARTE, id: 'r2', title: 'Pâte sucrée', ingredients: [{ name: 'farine', quantity: 250, unit: 'g', note: null }] }
    api.recipes.getRecipe.mockImplementation(async (id: string) => (id === 'r2' ? pate : TARTE))
    api.recipes.listUsages.mockResolvedValue({ meals: [], recipes: [{ id: PARENT, title: 'Tarte à la banane' }] })
    renderApp(api, '/recettes/r2')
    await user.click(await screen.findByRole('button', { name: /Supprimer/ }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Suppression impossible' })
    await user.click(within(dialog).getByRole('link', { name: 'Tarte à la banane' }))
    expect(await screen.findByRole('heading', { name: 'Tarte à la banane' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('garde le lien en modifiant la recette, ou le retire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const linkedRecipe = { id: 'r2', title: 'Pâte sucrée' }
    api.recipes.getRecipe.mockResolvedValue({ ...TARTE, ingredients: [{ ...TARTE.ingredients[0]!, linkedRecipe }, TARTE.ingredients[1]!] })
    api.recipes.saveRecipe.mockResolvedValue(PARENT)
    renderApp(api, `/recettes/${PARENT}/modifier`)

    expect(await screen.findByText('Recette liée : Pâte sucrée')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.recipes.saveRecipe).toHaveBeenCalledTimes(1))
    expect(api.recipes.saveRecipe.mock.calls[0]![0].ingredients.map((i) => i.linkedRecipe)).toEqual([linkedRecipe, undefined])
  })

  it('retire un lien depuis le formulaire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.recipes.getRecipe.mockResolvedValue({ ...TARTE, ingredients: [{ ...TARTE.ingredients[0]!, linkedRecipe: { id: 'r2', title: 'Pâte sucrée' } }] })
    api.recipes.saveRecipe.mockResolvedValue(PARENT)
    renderApp(api, `/recettes/${PARENT}/modifier`)
    await user.click(await screen.findByRole('button', { name: 'Retirer le lien vers Pâte sucrée' }))
    expect(screen.queryByText('Recette liée : Pâte sucrée')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.recipes.saveRecipe).toHaveBeenCalledTimes(1))
    expect(api.recipes.saveRecipe.mock.calls[0]![0].ingredients[0]!.linkedRecipe).toBeUndefined()
  })
})

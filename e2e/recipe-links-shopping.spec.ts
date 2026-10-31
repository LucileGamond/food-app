import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('relie les recettes d’un livre, puis ajoute une recette aux courses', async ({ page }) => {
  // Regroupement des courses simulé (aucun appel réel au modèle).
  await page.route('**/functions/v1/tidy-shopping', async (route) => {
    const { lines } = route.request().postDataJSON() as { lines: { id: string; name: string; aisle: string }[] }
    await route.fulfill({ json: { lines: lines.map((l) => ({ id: l.id, name: l.name, aisle: l.aisle, pantry: false })) } })
  })
  const { api } = await signedInApi()
  const base = { id: null, notes: null, url: null, servings: 4, tags: [], source: 'Pâtisserie maison' }
  const tarte = await api.recipes.saveRecipe({
    ...base,
    title: 'Tarte au citron',
    sourcePage: '146',
    ingredients: [
      { name: 'pâte sucrée', quantity: 1, unit: null, note: 'voir p. 208' },
      { name: 'citrons', quantity: 4, unit: null, note: null },
    ],
  })
  await api.recipes.saveRecipe({ ...base, title: 'Pâte sucrée', sourcePage: '208', ingredients: [{ name: 'farine', quantity: 250, unit: 'g', note: null }] })

  await login(page)
  await page.goto('/recettes')
  await page.getByRole('button', { name: 'Relier les recettes' }).click()
  await expect(page.getByText('« Tarte au citron » renvoie maintenant à « Pâte sucrée »')).toBeVisible()

  await page.goto(`/recettes/${tarte}`)
  await expect(page.getByRole('link', { name: 'Recette : Pâte sucrée' })).toBeVisible()

  // Courses pour 2 personnes : 4 citrons pour 4 → 2.
  await page.getByRole('button', { name: 'Une personne de moins' }).click()
  await page.getByRole('button', { name: 'Une personne de moins' }).click()
  await page.getByRole('button', { name: 'Courses' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter aux courses' })
  await expect(dialog.getByRole('checkbox', { name: 'Acheter « Citrons »' })).toBeChecked()
  await dialog.getByLabel('Nom de la liste').fill('Tarte du week-end')
  await dialog.getByRole('button', { name: /Créer la liste/ }).click()
  await expect(page.getByRole('heading', { name: 'Tarte du week-end' })).toBeVisible()
  await expect(page.getByText('Citrons')).toBeVisible()
})

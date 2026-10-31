import AxeBuilder from '@axe-core/playwright'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('cuisine une recette : ingrédients et étapes à cocher, en plein écran', async ({ page }) => {
  const { api } = await signedInApi()
  const id = await api.recipes.saveRecipe({
    id: null,
    title: 'Tarte aux pommes',
    notes: '1. Préchauffer le four à 180 °C.\n2. Étaler la pâte.\n3. Cuire 30 min.',
    url: null,
    servings: 4,
    tags: [],
    ingredients: [
      { name: 'pommes', quantity: 4, unit: null, note: null },
      { name: 'sucre', quantity: 50, unit: 'g', note: null },
    ],
  })

  await login(page)
  await page.goto(`/recettes/${id}`)
  await page.getByRole('button', { name: 'Une personne de plus' }).click()
  await page.getByRole('link', { name: 'Cuisiner' }).click()

  // Plein écran : pas de navigation de l'application.
  await expect(page.getByRole('heading', { name: 'Tarte aux pommes' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '5 pommes' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Étape/ })).toHaveCount(3)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.getByRole('checkbox', { name: '5 pommes' }).click()
  await page.getByRole('checkbox', { name: 'Étape 1 faite' }).click()
  await expect(page.locator('[aria-current="step"]')).toContainText('Étaler la pâte.')

  // Rechargement (écran rallumé, onglet rouvert) : les cases restent cochées.
  await page.reload()
  await expect(page.getByRole('checkbox', { name: '5 pommes' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('checkbox', { name: 'Étape 1 faite' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('checkbox', { name: 'Étape 2 faite' }).click()
  await page.getByRole('checkbox', { name: 'Étape 3 faite' }).click()
  await expect(page.getByRole('status')).toContainText('Bon appétit')

  await page.getByRole('link', { name: 'Quitter le mode cuisine' }).first().click()
  await expect(page.getByRole('link', { name: 'Cuisiner' })).toBeVisible()
})

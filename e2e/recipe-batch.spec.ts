import AxeBuilder from '@axe-core/playwright'
import { expect, login, test } from './fixtures'

// Image PNG 1×1 : le contenu n'importe pas, la lecture par le modèle est simulée (aucun appel réel).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const recipe = (title: string, page: string | null, nutrition: unknown = null) => ({
  recipe: {
    title,
    servings: 6,
    ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null, section: null }],
    steps: '1. Mélanger.',
    tags: ['dessert'],
    checks: [{ ingredient: 0, message: 'ignoré en série' }],
    source: 'Pâtisserie maison',
    page,
    nutrition,
    prep_minutes: null,
    rest_minutes: null,
    cook_minutes: null,
  },
  source: 'photo',
  image: null,
})

test('importe en série les recettes d’un livre, une image par page', async ({ page }) => {
  // Une réponse par image : page avec 2 recettes, page sans recette, doublon.
  const tarte = recipe('Tarte au citron', '146', { per: 'portion', kcal: 380, carbs: 45, protein: 6, fat: 19 })
  const replies = [
    { json: { ...tarte, recipes: [tarte.recipe, recipe('Pâte sablée', '146').recipe] } },
    { status: 422, json: { error: 'Aucune recette trouvée sur cette photo.' } },
    { json: recipe('Tarte au citron', '147') },
  ]
  let calls = 0
  await page.route('**/functions/v1/import-recipe', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string; images?: unknown[] }
    expect(body.mode).toBe('photos')
    expect(body.images).toHaveLength(1)
    calls += 1
    // Réponses dans l'ordre d'arrivée des requêtes (2 à la fois) : le résultat final n'en dépend pas.
    await route.fulfill(replies.shift()!)
  })
  await login(page)

  await page.getByRole('link', { name: 'Recettes' }).filter({ visible: true }).click()
  await page.getByRole('link', { name: 'Importer en série' }).click()
  await expect(page.getByRole('heading', { name: 'Importer en série' })).toBeVisible()
  await page.getByLabel('Livre', { exact: true }).fill('Pâtisserie maison')
  await page.getByLabel('Photos des pages').setInputFiles([
    { name: 'page-146.png', mimeType: 'image/png', buffer: PNG_1PX },
    { name: 'page-147.png', mimeType: 'image/png', buffer: PNG_1PX },
    { name: 'page-148.png', mimeType: 'image/png', buffer: PNG_1PX },
  ])
  await expect(page.getByText('3 images · de « page-146.png » à « page-148.png »')).toBeVisible()
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])

  await page.getByRole('button', { name: 'Lancer l’import (3)' }).click()
  await expect(page.getByRole('heading', { name: /Import terminé · 3 \/ 3/ })).toBeVisible()
  await expect(page.getByText('2 enregistrées · 1 déjà enregistrée · 1 ignorée')).toBeVisible()
  await expect(page.getByText(/· 2 recettes/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pâte sablée' })).toBeVisible()
  expect(calls).toBe(3)
  await page.screenshot({ path: `test-results/layout/import-serie-${test.info().project.name}.png`, fullPage: true })

  // La recette enregistrée : livre, page lue sur l'image, valeurs nutritionnelles
  await page.getByRole('link', { name: 'Tarte au citron' }).first().click()
  await expect(page.getByRole('heading', { name: 'Tarte au citron' })).toBeVisible()
  await expect(page.getByText('Pâtisserie maison, p. 146')).toBeVisible()
  await expect(page.getByText('380 kcal · glucides 45 g · protéines 6 g · lipides 19 g (par portion)')).toBeVisible()
})

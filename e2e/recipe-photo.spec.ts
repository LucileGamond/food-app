import AxeBuilder from '@axe-core/playwright'
import { expect, login, test } from './fixtures'

// Image PNG 1×1 : le contenu n'importe pas, la lecture par le modèle est simulée (aucun appel réel).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('crée une recette à partir de la photo d’une page de livre', async ({ page }) => {
  let sent: { mode?: string; images?: { type: string; data: string }[] } = {}
  await page.route('**/functions/v1/import-recipe', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({
      json: {
        recipe: {
          title: 'Tarte à la banane et au café',
          servings: 6,
          ingredients: [
            { name: 'pâte sucrée', quantity: 200, unit: 'g', note: null, section: null },
            { name: 'bananes mûres', quantity: 5, unit: null, note: null, section: null },
            { name: 'beurre demi-sel', quantity: 50, unit: 'g', note: null, section: 'Pour le streusel' },
          ],
          source: 'p. 146',
          prep_minutes: 10,
          rest_minutes: 120,
          cook_minutes: 40,
          steps: '1. Préparez le fond de tarte.',
          tags: ['dessert'],
          checks: [{ ingredient: 1, message: 'Quantité approximative (4 ou 5)' }],
        },
        source: 'photo',
        image: null,
      },
    })
  })
  await login(page)
  await page.goto('/recettes/nouvelle')

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles([
    { name: 'page-146.png', mimeType: 'image/png', buffer: PNG_1PX },
    { name: 'page-147.png', mimeType: 'image/png', buffer: PNG_1PX },
  ])
  await expect(page.getByRole('list', { name: 'Pages à lire' }).getByRole('img')).toHaveCount(2)
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])

  await page.getByRole('button', { name: 'Lire la recette' }).click()
  await expect(page.getByRole('status')).toContainText('Recette préremplie depuis tes photos.')
  expect(sent.mode).toBe('photos')
  expect(sent.images?.map((i) => i.type)).toEqual(['image/jpeg', 'image/jpeg'])

  await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('Tarte à la banane et au café')
  const review = page.getByRole('region', { name: 'À vérifier (1)' })
  await expect(review).toContainText('bananes mûres · Quantité approximative (4 ou 5)')
  await review.getByRole('button', { name: 'Agrandir la page 1' }).click()
  await expect(page.getByRole('dialog', { name: 'Page 1' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `test-results/layout/photo-a-verifier-${test.info().project.name}.png`, fullPage: true })
  await review.getByRole('button', { name: /bananes mûres/ }).click()
  await expect(page.getByLabel("Quantité de l'ingrédient 2")).toBeFocused()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Tarte à la banane et au café' })).toBeVisible()
  await expect(page.getByText('200 g pâte sucrée')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pour le streusel' })).toBeVisible()
  await expect(page.getByText('Préparation 10 min · Repos 2 h · Cuisson 40 min')).toBeVisible()
  await expect(page.getByText('p. 146')).toBeVisible()
  // La page du livre n'est pas gardée comme photo de la recette.
  await expect(page.getByRole('button', { name: /^Photo \d$/ })).toHaveCount(0)
})

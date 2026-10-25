import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addDays, todayIso } from '../src/lib/dates'
import { signedInApi } from '../tests/integration/helpers'
import { ERIC, LUCILE, expect, login, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

/** Planning de la semaine : une recette enregistrée, une recette avec lien, une sans ingrédients. */
async function planWeek() {
  const { api } = await signedInApi()
  const today = todayIso()
  const tartiflette = await api.recipes.saveRecipe({
    id: null,
    title: 'Tartiflette',
    notes: null,
    url: null,
    servings: 4,
    tags: [],
    ingredients: [
      { name: 'pommes de terre', quantity: 1, unit: 'kg', note: null },
      { name: 'reblochon', quantity: 1, unit: null, note: null },
      { name: 'sel', quantity: null, unit: null, note: null },
    ],
  })
  await api.meals.createMeal({ date: addDays(today, 1), slot: 'DINNER', people: [LUCILE.id, ERIC.id], source: { kind: 'saved', recipeId: tartiflette } })
  await api.meals.createMeal({ date: addDays(today, 2), slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'adhoc', title: 'Curry', notes: '', url: 'https://exemple.fr/curry' } })
  await api.meals.createMeal({ date: addDays(today, 3), slot: 'DINNER', people: [LUCILE.id, ERIC.id], source: { kind: 'adhoc', title: 'Raclette', notes: '', url: '' } })
}

test.beforeEach(async ({ page }) => {
  await planWeek()
  // Aucun appel réel au modèle : la lecture de la page et le regroupement sont simulés.
  await page.route('**/functions/v1/import-recipe', (route) =>
    route.fulfill({
      json: {
        recipe: { title: 'Curry', servings: 2, ingredients: [{ name: 'lait de coco', quantity: 40, unit: 'cl', note: null }], steps: '', tags: [] },
        source: 'structured',
        image: null,
      },
    }),
  )
  await page.route('**/functions/v1/tidy-shopping', async (route) => {
    const { lines } = route.request().postDataJSON() as { lines: { id: string; name: string; aisle: string }[] }
    await route.fulfill({ json: { lines: lines.map((l) => ({ id: l.id, name: l.name, aisle: l.aisle, pantry: false })) } })
  })
  await login(page)
})

test('génère une liste de courses depuis le planning', async ({ page }) => {
  await page.getByRole('button', { name: 'Liste de courses' }).click()
  const dialog = page.getByRole('dialog', { name: 'Liste de courses' })
  await expect(dialog.getByRole('checkbox')).toHaveCount(3)
  await expect(dialog.getByRole('button', { name: 'Préparer la liste (3 repas)' })).toBeEnabled()
  await expectNoA11yViolations(page)

  await dialog.getByRole('button', { name: 'Préparer la liste (3 repas)' }).click()
  // Quantités adaptées : tartiflette pour 2 (recette pour 4), curry pour 1 (recette pour 2).
  await expect(dialog.getByRole('region', { name: 'Fruits et légumes' })).toContainText('0,5 kg')
  await expect(dialog.getByRole('region', { name: 'Crèmerie' })).toContainText('Reblochon')
  await expect(dialog.getByRole('region', { name: 'Épicerie salée' })).toContainText('20 cl')
  await expect(dialog.getByRole('checkbox', { name: 'Acheter « Sel »' })).not.toBeChecked()
  await expect(dialog.getByRole('region', { name: 'Non repris (1)' })).toContainText('Raclette')
  await expectNoA11yViolations(page)

  await dialog.getByRole('button', { name: 'Créer la liste (3 articles)' }).click()
  await expect(page.getByRole('heading', { name: /^Courses du /, level: 1 })).toBeVisible()
  await expect(page.getByTestId('shopping-item')).toHaveCount(3)
  const skipped = page.getByRole('region', { name: 'Non repris (2)' })
  await expect(skipped).toContainText('Raclette')
  await expect(skipped).toContainText('Sel')
  await expectNoA11yViolations(page)

  await skipped.getByRole('button', { name: 'Ajouter « Sel »' }).click()
  await expect(page.getByTestId('shopping-item')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Non repris (1)' })).toBeVisible()
})

test('complète une liste existante', async ({ page }) => {
  const { api } = await signedInApi()
  const list = await api.shopping.createList('Marché')
  await api.shopping.addItem(list, { name: 'Pommes de terre', quantity: 500, unit: 'g', aisle: 'FRUITS_LEGUMES' }, 0)

  await page.getByRole('button', { name: 'Liste de courses' }).click()
  const dialog = page.getByRole('dialog', { name: 'Liste de courses' })
  await dialog.getByRole('button', { name: /Préparer la liste/ }).click()
  await dialog.getByRole('radio', { name: 'Compléter une liste' }).click()
  await expect(dialog.getByLabel('Liste à compléter')).toHaveValue(list)
  await dialog.getByRole('button', { name: 'Ajouter (3 articles)' }).click()

  await expect(page.getByRole('heading', { name: 'Marché', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fruits et légumes' })).toContainText('1 000 g')
  await expect(page.getByTestId('shopping-item')).toHaveCount(3)
})

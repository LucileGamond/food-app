import { axeFor } from './support/a11y'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('calcule les calories d’une recette qui n’en a pas, puis les enregistre', async ({ page }) => {
  // Fonction simulée : le calcul réel (table Ciqual + modèle) est couvert par les tests de la fonction.
  let sent: { title?: string; servings?: number; ingredients?: { name: string }[] } = {}
  await page.route('**/functions/v1/estimate-nutrition', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({
      json: {
        per: 'portion',
        kcal: 215,
        protein: 6.2,
        carbs: 28.4,
        fat: 8.1,
        ingredients: [
          { name: 'poireaux', food: { code: '20025', name: 'Poireau, cru' }, grams: 600, kcal: 174 },
          { name: 'pommes de terre', food: { code: '4003', name: 'Pomme de terre, crue' }, grams: 400, kcal: 316 },
          { name: 'sel', food: null, grams: null, kcal: null },
        ],
      },
    })
  })
  const { api } = await signedInApi()
  const id = await api.recipes.saveRecipe({
    id: null,
    title: 'Soupe poireaux pommes de terre',
    notes: null,
    url: null,
    servings: 4,
    tags: [],
    ingredients: [
      { name: 'poireaux', quantity: 3, unit: null, note: null },
      { name: 'pommes de terre', quantity: 400, unit: 'g', note: null },
      { name: 'sel', quantity: null, unit: null, note: null },
    ],
  })

  await login(page)
  await page.goto(`/recettes/${id}`)
  await page.getByRole('button', { name: 'Calculer les calories' }).click()
  const dialog = page.getByRole('dialog', { name: 'Calories et macros' })
  await expect(dialog.getByRole('region', { name: 'Valeurs par portion' })).toContainText('215 kcal')
  await expect(dialog.getByText('Poireau, cru · 600 g')).toBeVisible()
  expect(sent).toMatchObject({ title: 'Soupe poireaux pommes de terre', servings: 4 })
  expect(sent.ingredients?.map((i) => i.name)).toEqual(['poireaux', 'pommes de terre', 'sel'])
  expect((await (await axeFor(page)).include('[role="dialog"]').analyze()).violations).toEqual([])

  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('215 kcal · glucides 28,4 g · protéines 6,2 g · lipides 8,1 g (par portion)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculer les calories' })).toHaveCount(0)
  // Enregistré en base : toujours là après rechargement.
  await page.reload()
  await expect(page.getByText('215 kcal · glucides 28,4 g · protéines 6,2 g · lipides 8,1 g (par portion)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculer les calories' })).toHaveCount(0)
})

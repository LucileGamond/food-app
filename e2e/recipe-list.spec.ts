import AxeBuilder from '@axe-core/playwright'
import { signedInApi } from '../tests/integration/helpers'
import { LUCILE, expect, login, test } from './fixtures'

const isoDay = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

test('trie et filtre les recettes, montre l’historique et enregistre un avis', async ({ page }) => {
  // Recettes et repas passés créés par l'API (le planning n'est pas l'objet du test).
  const { api } = await signedInApi()
  const base = { id: null, notes: null, url: null, servings: 4, tags: [] }
  const curry = await api.recipes.saveRecipe({
    ...base,
    title: 'Curry de lentilles',
    ingredients: [{ name: 'lentilles corail', quantity: 200, unit: 'g', note: null }],
    source: 'Ottolenghi',
    sourcePage: '12',
    prepMinutes: 10,
    cookMinutes: 15,
    nutrition: { per: 'portion', kcal: 420, carbs: null, protein: null, fat: null },
  })
  await api.recipes.saveRecipe({
    ...base,
    title: 'Blanquette de veau',
    ingredients: [{ name: 'veau', quantity: 1, unit: 'kg', note: null }],
    source: 'Pâtisserie maison',
    prepMinutes: 30,
    cookMinutes: 120,
  })
  await api.meals.createMeal({ date: isoDay(-3), slot: 'DINNER', people: [LUCILE.id], source: { kind: 'saved', recipeId: curry } })

  await login(page)
  await page.goto('/recettes')
  const cards = page.getByRole('main').getByRole('listitem')
  await expect(cards).toHaveCount(2)
  const curryCard = page.getByRole('link', { name: /Curry de lentilles/ })
  await expect(curryCard).toContainText('25 min')
  await expect(curryCard).toContainText('420 kcal / portion')
  await expect(curryCard).toContainText('Végé')
  await expect(curryCard).toContainText('Ottolenghi, p. 12')
  await expect(curryCard).toContainText('Cuisinée le')

  // Filtres rapides et tri
  await page.getByRole('button', { name: 'Végé' }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Végé' }).click()
  await page.getByRole('button', { name: '30 min max' }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('button', { name: 'Effacer les filtres' }).click()
  await page.getByRole('combobox', { name: 'Trier les recettes' }).selectOption({ label: 'Pas cuisinées depuis longtemps' })
  await expect(cards.first()).toContainText('Blanquette de veau')
  await page.getByRole('combobox', { name: 'Filtrer par source' }).selectOption({ label: 'Ottolenghi' })
  await expect(cards).toHaveCount(1)

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])

  // Fiche : historique, avis ; au retour, la liste est comme on l'a laissée.
  await curryCard.click()
  await expect(page.getByText(/^Cuisinée le/)).toBeVisible()
  const reviews = page.getByRole('region', { name: 'Avis' })
  await reviews.getByRole('button', { name: '4 sur 5' }).click()
  await reviews.getByRole('textbox', { name: 'Mon commentaire' }).fill('Eric adore')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await reviews.getByRole('button', { name: 'Enregistrer mon avis' }).click()
  await expect(page.getByText('Avis enregistré')).toBeVisible()

  await page.goBack()
  await expect(page.getByRole('combobox', { name: 'Filtrer par source' })).toHaveValue('livre:Ottolenghi')
  await expect(page.getByRole('link', { name: /Curry de lentilles/ }).getByLabel('Note 4 sur 5')).toBeVisible()
})

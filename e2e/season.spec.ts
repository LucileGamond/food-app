import AxeBuilder from '@axe-core/playwright'
import { MONTH_NAMES } from '../src/lib/season'
import { SEASON_CALENDAR } from '../src/lib/seasonCalendar'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('recettes de saison : badge, filtre, fiche et page « Ce mois-ci »', async ({ page }) => {
  // Produits choisis d'après le mois en cours : le test ne dépend pas de la date.
  const month = new Date().getMonth() + 1
  const fresh = SEASON_CALENDAR.find((p) => p.kind === 'légume' && p.months.includes(month))!
  const stale = SEASON_CALENDAR.find((p) => p.kind === 'légume' && !p.months.includes(month))!
  const { api } = await signedInApi()
  const recipe = (title: string, ingredient: string) =>
    api.recipes.saveRecipe({ id: null, title, notes: null, url: null, servings: 2, tags: [], ingredients: [{ name: ingredient.toLowerCase(), quantity: 2, unit: null, note: null }] })
  await recipe('Saison test : poêlée du mois', fresh.name)
  const staleId = await recipe('Saison test : plat d’une autre saison', stale.name)

  await login(page)
  await page.goto('/recettes')
  await page.getByRole('searchbox', { name: 'Rechercher une recette' }).or(page.getByRole('textbox', { name: 'Rechercher une recette' })).fill('Saison test')
  await expect(page.getByRole('link', { name: /poêlée du mois/ })).toContainText('De saison')
  await expect(page.getByRole('link', { name: /autre saison/ })).not.toContainText('De saison')
  await page.getByRole('group', { name: 'Filtres rapides' }).getByRole('button', { name: 'De saison' }).click()
  await expect(page.getByRole('link', { name: /autre saison/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /poêlée du mois/ })).toBeVisible()

  await page.goto(`/recettes/${staleId}`)
  await expect(page.getByText(`Hors saison en ${MONTH_NAMES[month - 1]} : ${stale.name.toLowerCase()}`)).toBeVisible()

  await page.goto('/recettes')
  await page.getByRole('link', { name: 'De saison', exact: true }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`^${MONTH_NAMES[month - 1]}$`, 'i') })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(`^${fresh.name} ?·`) }).click()
  await expect(page.getByRole('link', { name: /poêlée du mois/ })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

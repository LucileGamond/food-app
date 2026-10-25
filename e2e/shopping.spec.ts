import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, login, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

async function addItem(page: Page, name: string, quantity?: string, unit?: string) {
  await page.getByLabel("Nom de l'article").fill(name)
  if (quantity) await page.getByLabel('Quantité').fill(quantity)
  if (unit) await page.getByLabel('Unité').selectOption(unit)
  await page.getByRole('button', { name: "Ajouter l'article" }).click()
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('crée une liste, ajoute des articles par rayon, coche et fait le ménage', async ({ page }) => {
  await page.getByRole('link', { name: 'Courses' }).filter({ visible: true }).click()
  await expect(page.getByText('Aucune liste', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nouvelle liste' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Nouvelle liste' })
  await dialog.getByLabel('Nom').fill('Courses de la semaine')
  await dialog.getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByRole('heading', { name: 'Courses de la semaine', level: 1 })).toBeVisible()

  // Rayon deviné à partir du nom
  await addItem(page, 'Farine', '200', 'g')
  await addItem(page, 'Pommes', '6')
  await addItem(page, 'Lait')
  await expect(page.getByRole('region', { name: 'Épicerie salée' })).toContainText('Farine')
  await expect(page.getByRole('region', { name: 'Fruits et légumes' })).toContainText('Pommes')
  await expect(page.getByRole('region', { name: 'Crèmerie' })).toContainText('Lait')

  // Même article : les quantités s'additionnent (unités converties)
  await addItem(page, 'farine', '0,3', 'kg')
  await expect(page.getByRole('region', { name: 'Épicerie salée' })).toContainText('500 g')
  await expect(page.getByTestId('shopping-item')).toHaveCount(3)

  // Cocher : l'article passe dans le caddie
  await page.getByRole('checkbox', { name: 'Cocher « Lait »' }).click()
  await expect(page.getByRole('region', { name: /Dans le caddie/ })).toContainText('Lait')
  await expect(page.getByText('1 / 3 dans le caddie')).toBeVisible()

  // Tout est enregistré
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByRole('region', { name: /Dans le caddie/ })).toContainText('Lait')
  await expect(page.getByRole('region', { name: 'Épicerie salée' })).toContainText('500 g')

  // Modifier un article
  await page.getByRole('button', { name: /^Modifier Pommes/ }).click()
  const edit = page.getByRole('dialog', { name: "Modifier l'article" })
  await edit.getByLabel('Quantité').fill('8')
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByRole('region', { name: 'Fruits et légumes' })).toContainText('8')

  // Retirer les cochés
  await page.getByRole('button', { name: 'Retirer les cochés' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retirer' }).click()
  await expect(page.getByRole('region', { name: /Dans le caddie/ })).toHaveCount(0)
  await expect(page.getByTestId('shopping-item')).toHaveCount(2)

  // Supprimer la liste
  await page.getByRole('button', { name: 'Actions sur la liste' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer la liste' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Aucune liste', { exact: true })).toBeVisible()
})

test('les écrans de courses respectent les règles d’accessibilité', async ({ page }) => {
  await page.goto('/courses')
  await page.getByRole('button', { name: 'Nouvelle liste' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByLabel("Nom de l'article")).toBeVisible()
  await addItem(page, 'Pommes', '6')
  await addItem(page, 'Pain')
  await page.getByRole('checkbox', { name: 'Cocher « Pain »' }).click()
  await expect(page.getByRole('region', { name: /Dans le caddie/ })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.getByRole('link', { name: 'Courses', exact: true }).first().click()
  await expect(page.getByRole('list', { name: 'Listes de courses' })).toBeVisible()
  await expectNoA11yViolations(page)
})

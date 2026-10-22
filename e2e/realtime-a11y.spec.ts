import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ERIC, addAdhocMeal, expect, login, slot, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('les changements d’Eric apparaissent chez Lucile sans recharger', async ({ page, browser }) => {
  await login(page)

  const ericContext = await browser.newContext()
  const eric = await ericContext.newPage()
  try {
    await login(eric, ERIC.email)
    // Laisse au canal temps réel de Lucile le temps de s'abonner.
    await page.waitForTimeout(1500)
    await addAdhocMeal(eric, 0, 'Soir', 'Raclette')
    await expect(slot(page, 0, 'Soir').getByText('Raclette')).toBeVisible({ timeout: 10_000 })
  } finally {
    await ericContext.close()
  }
})

test('les écrans respectent les règles d’accessibilité', async ({ page }) => {
  await page.goto('/login')
  await expectNoA11yViolations(page)

  await login(page)
  await addAdhocMeal(page, 0, 'Midi', 'Soupe', { notes: 'https://exemple.fr/soupe' })
  await expectNoA11yViolations(page)

  await page.getByRole('button', { name: 'Actions pour Soupe' }).click()
  await page.getByRole('menuitem', { name: 'Modifier' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoA11yViolations(page)
  await page.keyboard.press('Escape')

  await page.goto('/recettes')
  await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.goto('/recettes/nouvelle')
  await expect(page.getByRole('heading', { name: 'Nouvelle recette' })).toBeVisible()
  await expectNoA11yViolations(page)
})

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ERIC, expect, login, navHasPage, openNavPage, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test('active le suivi d’hydratation dans les réglages, note des verres, puis le désactive', async ({ page, browser }) => {
  await login(page)
  expect(await navHasPage(page, 'Eau')).toBe(false)

  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByRole('checkbox', { name: 'Eau' }).first().click()
  await expect(page.getByRole('region', { name: 'Eau' })).toBeVisible()

  await openNavPage(page, 'Eau')
  await expect(page.getByRole('heading', { name: 'Eau' })).toBeVisible()
  await expect(page.getByText('Rien bu aujourd’hui pour l’instant.')).toBeVisible()
  await page.getByRole('button', { name: /Petit verre/ }).click()
  await page.getByRole('button', { name: /Grand verre/ }).click()
  const today = page.getByRole('region', { name: 'Aujourd’hui' })
  await expect(today.getByText('0,53 L')).toBeVisible()
  await expect(page.getByRole('button', { name: /Supprimer le verre de/ })).toHaveCount(2)
  await expectNoA11yViolations(page)

  // Gardé au rechargement ; un verre noté par erreur se supprime
  await page.reload()
  await expect(today.getByText('0,53 L')).toBeVisible()
  await page.getByRole('button', { name: /Supprimer le verre de/ }).first().click()
  await expect(today.getByText('0,2 L')).toBeVisible()

  // Réglages individuels : Eric n'a pas le suivi
  const ericContext = await browser.newContext()
  const eric = await ericContext.newPage()
  try {
    await login(eric, ERIC.email)
    expect(await navHasPage(eric, 'Eau')).toBe(false)
    await eric.goto('/hydratation')
    await expect(eric.getByRole('heading', { name: 'Planning' })).toBeVisible()
  } finally {
    await ericContext.close()
  }

  // Désactivé : la page disparaît de la navigation
  await page.goto('/reglages')
  await page.getByRole('checkbox', { name: 'Eau' }).first().click()
  await expect(page.getByRole('region', { name: 'Eau' })).toHaveCount(0)
  expect(await navHasPage(page, 'Eau')).toBe(false)
})

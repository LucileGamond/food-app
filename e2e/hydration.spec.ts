import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
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
    await expect(eric.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  } finally {
    await ericContext.close()
  }

  // Désactivé : la page disparaît de la navigation
  await page.goto('/reglages')
  await page.getByRole('checkbox', { name: 'Eau' }).first().click()
  await expect(page.getByRole('region', { name: 'Eau' })).toHaveCount(0)
  expect(await navHasPage(page, 'Eau')).toBe(false)
})

test('règle ses contenants, puis boit à la gourde', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  await login(page)
  await page.goto('/reglages')
  const form = page.getByRole('form', { name: 'Contenants' })
  await form.getByRole('button', { name: 'Ajouter un contenant' }).click()
  await form.getByRole('textbox', { name: 'Nom du contenant 3' }).fill('Gourde')
  await form.getByRole('textbox', { name: 'Volume du contenant 3 (cl)' }).fill('75')
  await form.getByRole('button', { name: 'Enregistrer les contenants' }).click()
  await expect(form.getByRole('button', { name: 'Enregistrer les contenants' })).toBeDisabled()
  await expectNoA11yViolations(page)

  await openNavPage(page, 'Eau')
  await page.getByRole('button', { name: /^Gourde/ }).click()
  await expect(page.getByRole('region', { name: 'Aujourd’hui' }).getByText('0,75 L', { exact: true })).toBeVisible()
  // Gardés au rechargement, et proposés sur l'accueil.
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Eau' }).getByRole('button', { name: /^Gourde/ })).toBeVisible()
})

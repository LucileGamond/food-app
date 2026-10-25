import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { dayLabel, dragTo, expect, login, slot, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

/** Panneau « À planifier » (déplié sur téléphone, où il est replié par défaut). */
async function openInbox(page: Page, isMobile: boolean) {
  const panel = page.getByRole('region', { name: /À planifier/ })
  if (isMobile) await panel.getByRole('button', { name: /À planifier/ }).click()
  return panel
}

test('ajoute des idées à la liste puis les planifie (bouton et glisser-déposer)', async ({ page, isMobile }) => {
  const panel = await openInbox(page, isMobile)
  await expect(panel.getByText(/Rien en attente/)).toBeVisible()

  await panel.getByLabel('Lien ou idée à planifier').fill('Raclette')
  await panel.getByLabel('Lien ou idée à planifier').press('Enter')
  await panel.getByLabel('Lien ou idée à planifier').fill('Soupe au potiron')
  await panel.getByRole('button', { name: 'Ajouter à la liste' }).click()
  await expect(panel.getByTestId('inbox-item')).toHaveCount(2)

  // Planifier par le bouton calendrier
  await panel.getByRole('button', { name: 'Planifier « Raclette »' }).click()
  const dialog = page.getByRole('dialog', { name: 'Planifier' })
  await dialog.getByLabel('Jour').selectOption({ label: dayLabel(1) })
  await dialog.getByRole('button', { name: 'Planifier' }).click()
  await expect(dialog).toBeHidden()
  await expect(slot(page, 1, 'Soir').getByText('Raclette')).toBeVisible()
  await expect(panel.getByTestId('inbox-item')).toHaveCount(1)

  // Glisser-déposer sur un créneau (au doigt : un créneau visible, juste sous le panneau)
  const [day, label] = isMobile ? ([0, 'Soir'] as const) : ([2, 'Midi'] as const)
  await dragTo(page, panel.getByTestId('inbox-item').filter({ hasText: 'Soupe au potiron' }), slot(page, day, label), isMobile)
  await expect(slot(page, day, label).getByText('Soupe au potiron')).toBeVisible()
  await expect(panel.getByText(/Rien en attente/)).toBeVisible()

  // Tout est enregistré
  await page.reload()
  await expect(slot(page, 1, 'Soir').getByText('Raclette')).toBeVisible()
  await expect(slot(page, day, label).getByText('Soupe au potiron')).toBeVisible()
})

test('reçoit un lien partagé depuis le téléphone', async ({ page, isMobile }) => {
  // Titre de la page simulé : le test ne dépend pas d'un site externe.
  await page.route('**/functions/v1/import-recipe', (route) => route.fulfill({ json: { title: 'Tarte tatin facile' } }))
  await page.goto(`/partage?text=${encodeURIComponent('Regarde : https://cuisine.exemple.fr/tatin')}`)
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
  await expect(page.getByText('Ajouté à « À planifier » : cuisine.exemple.fr')).toBeVisible()

  const panel = await openInbox(page, isMobile)
  await expect(panel.getByTestId('inbox-item')).toContainText('Tarte tatin facile')
  await expect(panel.getByTestId('inbox-item')).toContainText('cuisine.exemple.fr')
})

test('ajoute une recette enregistrée à la liste depuis sa fiche', async ({ page, isMobile }) => {
  await page.goto('/recettes/nouvelle')
  await page.getByLabel('Titre').fill('Curry maison')
  await page.getByLabel("Nom de l'ingrédient 1").fill('Riz')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.getByRole('button', { name: 'À planifier' }).click()
  await expect(page.getByText('Ajoutée à la liste « À planifier »')).toBeVisible()

  await page.getByRole('link', { name: 'Planning' }).filter({ visible: true }).click()
  const panel = await openInbox(page, isMobile)
  await expect(panel.getByRole('link', { name: 'Curry maison' })).toBeVisible()
  await expect(panel.getByText('Recette enregistrée')).toBeVisible()
})

test('le panneau et le dialogue respectent les règles d’accessibilité', async ({ page, isMobile }) => {
  const panel = await openInbox(page, isMobile)
  await panel.getByLabel('Lien ou idée à planifier').fill('Raclette')
  await panel.getByLabel('Lien ou idée à planifier').press('Enter')
  await expect(panel.getByTestId('inbox-item')).toHaveCount(1)
  await expectNoA11yViolations(page)
  await panel.getByRole('button', { name: 'Planifier « Raclette »' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoA11yViolations(page)
})

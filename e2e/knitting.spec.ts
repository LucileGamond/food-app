import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, login, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

const PATTERN = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  steps: [
    { title: 'Dos – côtes', instructions: 'Monter 64 m. et tricoter 18 rangs en côtes 1/1.', totalRows: 18, stitches: 64, reminders: [] },
    {
      title: 'Emmanchures',
      instructions: 'Diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
      totalRows: 30,
      stitches: 56,
      reminders: [{ every: 6, first: null, times: 4, action: '1 diminution de chaque côté' }],
    },
  ],
}

test('charge un patron PDF pour une taille, compte les rangs et retrouve son avancée', async ({ page }) => {
  // Lecture par le modèle simulée (pas d'appel réel).
  let sent: { size?: string; pdf?: string } = {}
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: PATTERN })
  })
  await login(page)

  // Module activé dans les réglages
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await page.getByRole('checkbox', { name: 'Tricot' }).click()
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true })
  await nav.getByRole('link', { name: 'Tricot' }).click()
  await expect(page.getByText('Aucun projet')).toBeVisible()

  await page.getByRole('link', { name: 'Nouveau patron' }).first().click()
  await page.getByLabel('Patron (PDF)').setInputFiles({ name: 'bergamote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fin') })
  await page.getByLabel('Taille choisie').fill('M')
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  await expect(page.getByRole('list', { name: 'Étapes lues' }).getByRole('listitem')).toHaveCount(2)
  expect(sent.size).toBe('M')
  expect(sent.pdf).toBe(Buffer.from('%PDF-1.4\n%fin').toString('base64'))
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()

  // Projet : première étape, puis la suivante
  await expect(page.getByRole('heading', { name: 'Dos – côtes' })).toBeVisible()
  await page.getByRole('button', { name: 'Étape terminée' }).click()
  await expect(page.getByRole('heading', { name: 'Emmanchures' })).toBeVisible()
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(page.getByRole('status')).toHaveText('Rang 6 : 1 diminution de chaque côté (1/4)')
  await page.getByLabel('Notes').fill('Aiguilles 4,5')
  await page.getByLabel('Notes').blur()
  await expectNoA11yViolations(page)

  // Avancée enregistrée
  await expect.poll(async () => {
    await page.reload()
    return page.getByLabel('Notes').inputValue()
  }).toBe('Aiguilles 4,5')
  await expect(page.getByRole('heading', { name: 'Emmanchures' })).toBeVisible()
  await expect(page.getByText('Prochaine fois : rang 12.')).toBeVisible()
  await expect(page.getByText('Taille M · 1 / 2 étapes')).toBeVisible()

  // Liste des projets, puis suppression
  await page.getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('link', { name: /Pull Bergamote/ })).toContainText('Taille M · 1 / 2 étapes')
  await page.getByRole('link', { name: /Pull Bergamote/ }).click()
  await page.getByRole('button', { name: 'Actions sur le projet' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer le projet' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByText('Aucun projet')).toBeVisible()
})

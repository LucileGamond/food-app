import AxeBuilder from '@axe-core/playwright'
import { expect, login, test } from './fixtures'

test('propose des idées de repas et ajoute celles choisies à « À planifier »', async ({ page, isMobile }) => {
  // Réponse simulée : aucun appel réel au modèle ni à la recherche web.
  let sent: { today?: string; candidates?: unknown[]; recent?: unknown[] } = {}
  await page.route('**/functions/v1/suggest-meals', async (route) => {
    sent = route.request().postDataJSON()
    const base = { vegetables: ['courge'], starch: 'riz', why: 'De saison' }
    await route.fulfill({
      json: {
        ideas: [
          { ...base, source: 'web', url: 'https://www.marmiton.org/recettes/curry-courge.aspx', site: 'Marmiton', title: 'Curry de courge', protein: 'pois chiches', vegetarian: true },
          { ...base, source: 'web', url: 'https://www.750g.com/omelette.htm', site: '750g', title: 'Omelette aux champignons', protein: 'œufs', vegetables: ['champignons'], starch: 'pommes de terre', vegetarian: true },
          { ...base, source: 'web', url: 'https://www.750g.com/saumon.htm', site: '750g', title: 'Saumon aux poireaux', protein: 'saumon', vegetables: ['poireau'], vegetarian: false },
        ],
      },
    })
  })
  await login(page)

  await page.getByRole('button', { name: 'Idées de repas' }).click()
  const dialog = page.getByRole('dialog', { name: 'Idées de repas' })
  await expect(dialog.getByRole('list', { name: 'Idées proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(sent.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(sent.candidates).toEqual([])
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  await page.screenshot({ path: `test-results/layout/idees-repas-${test.info().project.name}.png`, fullPage: true })

  await dialog.getByRole('checkbox', { name: 'Curry de courge' }).click()
  await dialog.getByRole('checkbox', { name: 'Saumon aux poireaux' }).click()
  await dialog.getByRole('button', { name: 'Ajouter à « À planifier » (2)' }).click()
  await expect(page.getByText('2 idées ajoutées à « À planifier »')).toBeVisible()
  await expect(dialog).toBeHidden()

  const panel = page.getByRole('region', { name: /À planifier/ })
  if (isMobile) await panel.getByRole('button', { name: /À planifier/ }).click()
  await expect(panel.getByTestId('inbox-item')).toHaveCount(2)
  await expect(panel.getByText('Curry de courge')).toBeVisible()
  await expect(panel.getByText('Saumon aux poireaux')).toBeVisible()
})

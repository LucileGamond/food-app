import { axeFor } from './support/a11y'
import { dayLabel, expect, login, openNavPage, test } from './fixtures'

test('note les repas du jour (végé ou non), les retrouve après rechargement et voit la part de végé', async ({ page }) => {
  await login(page)
  await openNavPage(page, 'Plan')

  const journal = page.getByRole('region', { name: 'Repas du jour' })
  await expect(journal.getByText(dayLabel(0), { exact: true })).toBeVisible()

  await journal.getByRole('group', { name: 'Petit-déj' }).getByRole('button', { name: 'Pas de repas' }).click()
  await journal.getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true }).click()
  await journal.getByRole('group', { name: 'Soir' }).getByRole('button', { name: 'Non végé', exact: true }).click()
  await expect(journal.getByText('1 jour d’affilée')).toBeVisible()

  const stats = page.getByRole('region', { name: 'Repas végés' })
  await expect(stats).toContainText('Cette semaine : 50 % (1 sur 2).')

  // Enregistré : retrouvé après rechargement
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(journal.getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(journal.getByRole('group', { name: 'Soir' }).getByRole('button', { name: 'Non végé', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Hier, rattrapé après coup
  await journal.getByRole('button', { name: 'Jour précédent' }).click()
  await expect(journal.getByText(dayLabel(-1), { exact: true })).toBeVisible()
  await expect(journal.getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true })).toHaveAttribute('aria-pressed', 'false')

  const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
})

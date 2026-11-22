import { axeFor } from './support/a11y'
import { dayLabel, expect, login, openNavPage, test } from './fixtures'

test('note les repas du jour (végé ou non), rattrape et corrige les jours passés depuis le graphique', async ({ page }) => {
  await login(page)
  await openNavPage(page, 'Végé')

  const journal = page.getByRole('region', { name: 'Repas du jour' })
  await journal.getByRole('group', { name: 'Petit-déj' }).getByRole('button', { name: 'Pas de repas' }).click()
  await journal.getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true }).click()
  await journal.getByRole('group', { name: 'Soir' }).getByRole('button', { name: 'Non végé', exact: true }).click()
  await expect(journal.getByText('1 jour d’affilée')).toBeVisible()

  const stats = page.getByRole('region', { name: 'Repas végés' })
  await expect(stats).toContainText('Cette semaine : 50 % (1 sur 2).')
  const late = page.getByRole('region', { name: 'À rattraper' })
  await expect(late).toContainText('Tous les jours passés sont remplis.')

  // Enregistré : retrouvé après rechargement
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(journal.getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(journal.getByRole('group', { name: 'Soir' }).getByRole('button', { name: 'Non végé', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Semaine dernière, depuis le graphique : il y a 7 jours, végé à midi
  const weekAgo = dayLabel(-7)
  await stats.getByRole('button', { name: /^Semaine du/ }).nth(-2).click()
  await stats.getByRole('group', { name: weekAgo }).getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true }).click()

  // Les jours pas remplis depuis apparaissent à rattraper, avec ce qui est déjà noté
  await expect(late.getByRole('group', { name: dayLabel(-1) })).toBeVisible()
  await expect(late.getByRole('group', { name: weekAgo }).getByRole('group', { name: 'Midi' }).getByRole('button', { name: 'Végé', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(late).toContainText('7 jours à remplir')

  // Hier, rempli après coup : il quitte la liste
  const yesterday = late.getByRole('group', { name: dayLabel(-1) })
  for (const name of ['Petit-déj', 'Midi', 'Soir']) await yesterday.getByRole('group', { name }).getByRole('button', { name: 'Végé', exact: true }).click()
  await expect(late.getByRole('group', { name: dayLabel(-1) })).toHaveCount(0)
  await expect(late).toContainText('6 jours à remplir')

  const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
})

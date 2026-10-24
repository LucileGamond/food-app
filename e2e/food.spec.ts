import { dayLabel, expect, login, test } from './fixtures'

test('crée un plan et une période, puis note des consommations', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Plan', exact: true }).filter({ visible: true }).click()
  await expect(page.getByText('Aucune période', { exact: true })).toBeVisible()

  // Plan : deux aliments
  await page.getByRole('link', { name: 'Modifier le plan' }).first().click()
  await expect(page.getByRole('heading', { name: 'Plan alimentaire' })).toBeVisible()
  await expect(page.getByText('Plan vide')).toBeVisible()

  await page.getByRole('button', { name: 'Ajouter un aliment' }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Ajouter un aliment' })
  await dialog.getByLabel('Moment').selectOption('LUNCH')
  await dialog.getByLabel('Catégorie').fill('Produit laitier')
  await dialog.getByLabel('Aliment').fill('Yaourt nature')
  await dialog.getByLabel('Quantité').fill('125')
  await dialog.getByLabel('Unité').fill('g')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'Ajouter un aliment (Déjeuner)' }).click()
  dialog = page.getByRole('dialog', { name: 'Ajouter un aliment' })
  await dialog.getByLabel('Catégorie').fill('Autres')
  await dialog.getByLabel('Aliment').fill('Moutarde')
  await dialog.getByLabel('Fois / période').fill('3')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: /^Modifier Moutarde/ })).toContainText('× 3')

  // Période de 14 jours à partir d'aujourd'hui
  await page.getByRole('main').getByRole('link', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Nouvelle période' }).first().click()
  dialog = page.getByRole('dialog', { name: 'Nouvelle période' })
  await expect(dialog.getByText('14 jours')).toBeVisible()
  await dialog.getByRole('button', { name: 'Créer la période' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(dayLabel(0), { exact: true })).toBeVisible()
  await expect(page.getByText('Jour 1 sur 14')).toBeVisible()

  // Quota d'une fois : la deuxième consommation est hors plan
  const yaourt = page.getByTestId(/^food-item-/).filter({ hasText: 'Yaourt nature' })
  await yaourt.getByRole('button', { name: /^Ajouter/ }).click()
  await expect(yaourt.getByText('1/1')).toBeVisible()
  await yaourt.getByRole('button', { name: /^Ajouter.*\(hors plan\)$/ }).click()
  await expect(yaourt.getByText('+1 hors plan')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Déjeuner\s*2 notés\s*1 hors plan/ })).toBeVisible()

  // Les consommations sont bien enregistrées
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(yaourt.getByText('+1 hors plan')).toBeVisible()

  await yaourt.getByRole('button', { name: /^Retirer/ }).click()
  await expect(yaourt.getByText('+1 hors plan')).toBeHidden()
  await expect(yaourt.getByText('1/1')).toBeVisible()

  // Jour suivant : rien de noté
  await page.getByRole('button', { name: 'Jour suivant' }).click()
  await expect(page.getByText(dayLabel(1), { exact: true })).toBeVisible()
  await expect(yaourt.getByRole('button', { name: /^Retirer/ })).toBeDisabled()
})

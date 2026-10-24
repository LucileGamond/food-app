import { expect, login, test } from './fixtures'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Poids' }).filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'Poids', exact: true })).toBeVisible()
})

test('ajoute des pesées, les modifie et les supprime depuis le graphique', async ({ page }) => {
  await expect(page.getByText('Aucune pesée', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Importer/ })).toHaveCount(0)

  // Première pesée, il y a 10 jours
  await page.getByRole('button', { name: 'Nouvelle pesée' }).first().click()
  let dialog = page.getByRole('dialog', { name: 'Nouvelle pesée' })
  await expect(dialog.getByLabel('Date')).toHaveValue(today())
  await dialog.getByLabel('Date').fill(daysAgo(10))
  await dialog.getByLabel('Lucile').fill('62,8')
  await dialog.getByLabel('Eric').fill('73.4')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()

  // Deuxième pesée, aujourd'hui
  await page.getByRole('button', { name: 'Nouvelle pesée' }).first().click()
  dialog = page.getByRole('dialog', { name: 'Nouvelle pesée' })
  await dialog.getByLabel('Lucile').fill('62,4')
  await dialog.getByLabel('Eric').fill('73.1')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()

  const lucile = page.getByRole('article', { name: 'Lucile' })
  await expect(lucile).toContainText('62,4 kg')
  await expect(lucile).toContainText('−0,4 kg')
  await expect(page.getByRole('article', { name: 'Eric' })).toContainText('73,1 kg')
  await expect(page.getByRole('table')).toHaveCount(0)

  // Clic sur le point de la pesée d'aujourd'hui : modification
  await page.locator(`[data-testid^="series-"] circle[data-date="${today()}"]`).first().click()
  const edit = page.getByRole('dialog', { name: 'Modifier la pesée' })
  await expect(edit.getByLabel('Date')).toHaveValue(today())
  await expect(edit.getByLabel('Eric')).toHaveValue('73,1')
  await edit.getByLabel('Lucile').fill('62')
  await edit.getByLabel('Eric').fill('')
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(edit).toBeHidden()
  await expect(lucile).toContainText('62,0 kg')
  await expect(page.getByRole('article', { name: 'Eric' })).toContainText('73,4 kg')

  // Clic sur le point de la première pesée : suppression
  await page.locator(`[data-testid^="series-"] circle[data-date="${daysAgo(10)}"]`).first().click()
  await page.getByRole('dialog', { name: 'Modifier la pesée' }).getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('alertdialog', { name: 'Supprimer cette pesée ?' }).getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('article', { name: 'Eric' })).toContainText('Aucune pesée')
  await expect(page.getByRole('status').filter({ hasText: "C'est l'heure de se peser" })).toContainText('Eric : aucune pesée enregistrée')
})

test('refuse un poids hors bornes', async ({ page }) => {
  await page.getByRole('button', { name: 'Nouvelle pesée' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Nouvelle pesée' })
  await dialog.getByLabel('Lucile').fill('6,25')
  await expect(dialog.getByText('Une décimale maximum')).toBeVisible()
  await dialog.getByLabel('Lucile').fill('12')
  await expect(dialog.getByText('Entre 20 et 300 kg')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
})

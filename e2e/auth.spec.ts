import { TEST_PASSWORD } from '../tests/integration/helpers'
import { LUCILE, expect, test } from './fixtures'

test('refuse un mauvais mot de passe', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(LUCILE.email)
  await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.')
  await expect(page).toHaveURL(/\/login$/)
})

test('protège les écrans, connecte, garde la session et déconnecte', async ({ page }) => {
  await page.goto('/recettes')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText(/inscri/i)).toHaveCount(0)

  // Après connexion, retour à l'écran demandé au départ
  await page.getByLabel('E-mail').fill(LUCILE.email)
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()

  // La session survit au rechargement, et /login renvoie vers l'application
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Recettes' })).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()

  await page.getByRole('button', { name: 'Se déconnecter' }).filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  await page.goto('/planning')
  await expect(page).toHaveURL(/\/login$/)
})

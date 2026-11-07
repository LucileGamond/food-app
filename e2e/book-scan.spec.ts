import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, login, test } from './fixtures'
import { writeBookVideo } from './support/bookVideo'

// Fausse caméra : Chrome lit une vidéo de pages qu'on tourne (page 1, page tournée, page 2, et ainsi de suite).
const video = writeBookVideo(join(tmpdir(), 'life-e2e', 'livre.y4m'))
test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
})

const recipe = (title: string) => ({
  recipe: { title, servings: 4, ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null, section: null }], steps: '1. Mélanger.', tags: [], page: null, nutrition: null },
  source: 'photo',
  image: null,
})

test('scanne un livre en tournant les pages : photo automatique, lecture au fil de l’eau, reprise', async ({ page }) => {
  test.setTimeout(90_000)
  let calls = 0
  await page.route('**/functions/v1/import-recipe', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string; images?: unknown[] }
    expect(body.mode).toBe('photos')
    expect(body.images).toHaveLength(1)
    calls += 1
    await route.fulfill({ json: recipe(`Recette scannée ${calls}`) })
  })
  await login(page)
  // Sur Android (projet « mobile »), le scan est proposé depuis l'import en série ; ailleurs, l'adresse directe.
  if (test.info().project.name === 'mobile') {
    await page.goto('/recettes/import-serie')
    await page.getByRole('link', { name: 'Scanner un livre' }).click()
  } else {
    await page.goto('/recettes/scanner')
  }
  await expect(page.getByRole('heading', { name: 'Scanner un livre' })).toBeVisible()
  await page.getByLabel('Livre', { exact: true }).fill('Livre scanné')
  await page.getByRole('button', { name: 'Ouvrir la caméra' }).click()
  // Réglage du téléphone : aperçu sans photo, jusqu'au lancement.
  await expect(page.getByRole('status')).toContainText('Règle le téléphone')
  await page.waitForTimeout(2500)
  expect(calls).toBe(0)
  await expect(page.getByText('0 page')).toBeVisible()
  await page.getByRole('button', { name: 'Lancer le scan' }).click()

  // Photos prises toutes seules (page 1, puis page 2 une fois tournée), lues 3 s plus tard.
  const scan = page.getByRole('region', { name: 'Scan en cours' })
  await expect(scan.getByRole('link', { name: 'Recette scannée 1' })).toBeVisible({ timeout: 20_000 })
  await expect(scan.getByRole('link', { name: 'Recette scannée 2' })).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `test-results/layout/scanner-${test.info().project.name}.png`, fullPage: true })
  await scan.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('status')).toHaveText('En pause : la photo automatique est arrêtée.')
  await scan.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.getByRole('heading', { name: 'Scan terminé' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/\d+ enregistrées/)).toBeVisible()

  // Session gardée sur le téléphone : proposée à la réouverture, puis abandonnée.
  await page.reload()
  await expect(page.getByText('Reprendre le scan de « Livre scanné »')).toBeVisible()
  await page.getByRole('button', { name: 'Abandonner' }).click()
  await expect(page.getByLabel('Livre', { exact: true })).toBeVisible()

  // Les recettes sont enregistrées avec le livre.
  await page.goto('/recettes')
  await expect(page.getByText('Recette scannée 1')).toBeVisible()
})

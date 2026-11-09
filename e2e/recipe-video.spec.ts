import { axeFor } from './support/a11y'
import { expect, login, test } from './fixtures'

// Fonction d'import simulée : la lecture de YouTube et le modèle sont couverts par les tests de la fonction.
const recipe = (title: string) => ({
  title,
  servings: 8,
  ingredients: [
    { name: 'flocons d’avoine', quantity: 100, unit: 'g', note: null, section: null },
    { name: 'framboises', quantity: 200, unit: 'g', note: null, section: null },
  ],
  steps: '1. Mélanger.\n2. Cuire 25 min.',
  tags: [],
  checks: [],
  source: null,
  page: null,
  nutrition: null,
  prep_minutes: 10,
  rest_minutes: null,
  cook_minutes: 25,
})

test('importe une recette depuis la légende d’un reel Instagram', async ({ page }) => {
  let requested: { mode?: string; text?: string; url?: string } = {}
  await page.route('**/functions/v1/import-recipe', async (route) => {
    requested = route.request().postDataJSON()
    await route.fulfill({ json: { recipe: recipe('Barres framboise'), source: 'text', image: null } })
  })
  await login(page)
  await page.goto('/recettes/nouvelle')
  const reel = 'https://www.instagram.com/reel/DfIBDEIIwic/'
  await page.getByLabel('Lien de la recette à importer').fill(reel)
  const caption = page.getByLabel('Légende du reel')
  await expect(caption).toBeVisible()
  expect((await (await axeFor(page)).analyze()).violations).toEqual([])

  await caption.fill('Barres framboise 🍓\n100 g de flocons d’avoine, 200 g de framboises…')
  await page.getByRole('button', { name: 'Préremplir avec la légende' }).click()
  await expect(page.getByRole('status')).toContainText('Recette préremplie depuis la légende')
  expect(requested).toMatchObject({ mode: 'text', url: reel, text: 'Barres framboise 🍓\n100 g de flocons d’avoine, 200 g de framboises…' })
  await expect(page.getByLabel('Titre')).toHaveValue('Barres framboise')
  await expect(page.getByLabel('Lien', { exact: true })).toHaveValue(reel)
})

test('importe une recette depuis une vidéo YouTube, trouvée sur le blog du créateur', async ({ page }) => {
  let requested: { url?: string } = {}
  await page.route('**/functions/v1/import-recipe', async (route) => {
    requested = route.request().postDataJSON()
    await route.fulfill({
      json: { recipe: { ...recipe('Gaufres de brocolis'), source: 'sacreeplanche.fr' }, source: 'video', image: null, foundUrl: 'https://www.sacreeplanche.fr/gaufres/' },
    })
  })
  await login(page)
  await page.goto('/recettes/nouvelle')
  const short = 'https://www.youtube.com/shorts/eBtsvbgDBD8'
  await page.getByLabel('Lien de la recette à importer').fill(short)
  await expect(page.getByLabel('Légende du reel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Préremplir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('sacreeplanche.fr (recette de la vidéo trouvée en ligne)')
  expect(requested.url).toBe(short)
  await expect(page.getByLabel('Titre')).toHaveValue('Gaufres de brocolis')
  await expect(page.getByLabel('Lien', { exact: true })).toHaveValue(short)
})

test('importe une recette depuis des captures de la légende d’un reel Instagram', async ({ page }) => {
  let requested: { mode?: string; images?: unknown[] } = {}
  await page.route('**/functions/v1/import-recipe', async (route) => {
    requested = route.request().postDataJSON()
    await route.fulfill({ json: { recipe: recipe('Barres framboise'), recipes: [recipe('Barres framboise')], source: 'photo', image: null } })
  })
  // Image PNG valide de 1 pixel (lue par le navigateur avant l'envoi).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await login(page)
  await page.goto('/recettes/nouvelle')
  const reel = 'https://www.instagram.com/reel/DecMC7uh4zl/'
  await page.getByLabel('Lien de la recette à importer').fill(reel)
  await expect(page.getByRole('button', { name: 'Captures de la légende' })).toBeVisible()
  await page.locator('input[type="file"][accept="image/*"]:not([capture])').setInputFiles([
    { name: 'capture-1.png', mimeType: 'image/png', buffer: png },
    { name: 'capture-2.png', mimeType: 'image/png', buffer: png },
    { name: 'capture-3.png', mimeType: 'image/png', buffer: png },
  ])
  await expect(page.getByRole('list', { name: 'Captures à lire' }).getByRole('img')).toHaveCount(3)
  expect((await (await axeFor(page)).exclude('[data-sonner-toaster]').analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Lire la recette' }).click()
  await expect(page.getByRole('status')).toContainText('Recette préremplie depuis tes captures')
  expect(requested.mode).toBe('photos')
  expect(requested.images).toHaveLength(3)
  await expect(page.getByLabel('Titre')).toHaveValue('Barres framboise')
  await expect(page.getByLabel('Lien', { exact: true })).toHaveValue(reel)
})

import { axeFor } from './support/a11y'
import { expect, login, test } from './fixtures'

// Fonction d'import simulée : l'analyse (modèle) est couverte par les tests de la fonction.
const CURRY = {
  recipe: {
    title: 'Curry coco',
    servings: 2,
    ingredients: [{ name: 'lait de coco', quantity: 40, unit: 'cl', note: null, section: null }],
    steps: '1. Mijoter 20 min.',
    tags: [],
    checks: [],
  },
  source: 'structured',
  image: null,
}

test('partage d’un lien : mis de côté, puis prérempli et enregistré depuis « De côté »', async ({ page }) => {
  let analysed = 0
  await page.route('**/functions/v1/import-recipe', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    // Titre de la page (sans analyse) pour la liste ; analyse seulement au préremplissage.
    if (body.mode === 'title') return route.fulfill({ json: { title: 'Curry coco express' } })
    analysed += 1
    await route.fulfill({ json: CURRY })
  })
  await login(page)
  await page.goto(`/partage?url=${encodeURIComponent('https://cuisine.exemple.fr/curry')}`)
  await expect(page.getByRole('heading', { name: 'Recette partagée' })).toBeVisible()
  expect((await (await axeFor(page)).exclude('[data-sonner-toaster]').analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Mettre de côté' }).click()

  // Écran Recettes : la section « De côté », sans analyse.
  const aside = page.getByRole('region', { name: /De côté/ })
  await expect(aside.getByTestId('aside-item')).toContainText('Curry coco express')
  expect(analysed).toBe(0)
  expect((await (await axeFor(page)).exclude('[data-sonner-toaster]').analyze()).violations).toEqual([])

  await aside.getByRole('button', { name: 'Préremplir et enregistrer « Curry coco express »' }).click()
  await expect(page.getByRole('status')).toContainText('Recette préremplie depuis cuisine.exemple.fr')
  expect(analysed).toBe(1)
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Curry coco' })).toBeVisible()

  // Enregistrée : plus dans « De côté ».
  await page.goto('/recettes')
  await expect(page.getByRole('link', { name: /Curry coco/ })).toBeVisible()
  await expect(page.getByRole('region', { name: /De côté/ })).toHaveCount(0)
})

test('partage d’un lien : « À planifier », puis prérempli et enregistré depuis le planning', async ({ page, isMobile }) => {
  await page.route('**/functions/v1/import-recipe', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    if (body.mode === 'title') return route.fulfill({ json: { title: null } })
    await route.fulfill({ json: CURRY })
  })
  await login(page)
  await page.goto(`/partage?url=${encodeURIComponent('https://cuisine.exemple.fr/curry')}&title=Curry`)
  await page.getByRole('button', { name: 'À planifier' }).click()
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()

  // Sur téléphone, le panneau est replié (sur ordinateur, toujours ouvert).
  const panel = page.getByRole('region', { name: /À planifier/ })
  if (isMobile) await panel.getByRole('button', { name: /À planifier/ }).click()
  await panel.getByRole('button', { name: 'Actions pour « Curry »' }).click()
  await page.getByRole('menuitem', { name: 'Préremplir et enregistrer' }).click()
  await expect(page.getByRole('status')).toContainText('Recette préremplie')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Curry coco' })).toBeVisible()

  // L'élément est devenu la recette enregistrée.
  await page.goto('/planning')
  const panelAfter = page.getByRole('region', { name: /À planifier/ })
  if (isMobile) await panelAfter.getByRole('button', { name: /À planifier/ }).click()
  await expect(panelAfter.getByTestId('inbox-item')).toContainText('Curry cocoRecette enregistrée')
})

import { addAdhocMeal, dayLabel, expect, login, mealAction, slot, test } from './fixtures'

// Petite image PNG valide (2×2), envoyée comme photo de recette.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('crée une recette complète, l’utilise au planning et bloque sa suppression', async ({ page }) => {
  await page.getByRole('link', { name: 'Recettes' }).filter({ visible: true }).click()
  await expect(page.getByText('Aucune recette', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Nouvelle recette' }).first().click()

  await page.getByLabel('Titre').fill('Curry de légumes')
  await page.getByLabel('Portions').fill('4')
  await page.getByRole('combobox', { name: 'Tags' }).fill('végé')
  await page.getByRole('combobox', { name: 'Tags' }).press('Enter')
  await page.getByRole('combobox', { name: 'Tags' }).fill('rapide')
  await page.getByRole('combobox', { name: 'Tags' }).press('Enter')
  await page.getByLabel("Quantité de l'ingrédient 1").fill('400')
  await page.getByLabel("Unité de l'ingrédient 1").fill('g')
  await page.getByLabel("Nom de l'ingrédient 1").fill('Pois chiches')
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await page.getByLabel("Nom de l'ingrédient 2").fill('Lait de coco')
  await page.getByLabel('Préparation').fill('Tout mélanger et laisser mijoter.')
  await page.getByLabel('Choisir des photos').setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
  ])
  await expect(page.getByTestId('photo-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Fiche
  await expect(page.getByRole('heading', { name: 'Curry de légumes' })).toBeVisible()
  await expect(page.getByText('400 g Pois chiches')).toBeVisible()
  await expect(page.getByText('4 portions')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Curry de légumes' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Photo \d$/ })).toHaveCount(2)

  // Liste : recherche par ingrédient et filtre par tag
  await page.getByRole('link', { name: 'Recettes' }).first().click()
  await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('coco')
  await expect(page.getByRole('link', { name: /Curry de légumes/ })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Rechercher une recette' }).fill('')
  await page.getByRole('button', { name: 'végé' }).click()
  await expect(page.getByRole('link', { name: /Curry de légumes/ })).toBeVisible()

  // Utilisation au planning
  await page.getByRole('link', { name: 'Planning' }).filter({ visible: true }).click()
  await page.getByRole('button', { name: `Ajouter un repas — ${dayLabel(1)}, Soir` }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter un repas' })
  await dialog.getByRole('tab', { name: 'Recette sauvegardée' }).click()
  await dialog.getByRole('radio', { name: /Curry de légumes/ }).check({ force: true })
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(slot(page, 1, 'Soir').getByRole('link', { name: 'Curry de légumes' })).toBeVisible()

  // Modification répercutée dans le planning
  await slot(page, 1, 'Soir').getByRole('link', { name: 'Curry de légumes' }).click()
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Titre').fill('Curry express')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Curry express' })).toBeVisible()
  await page.getByRole('link', { name: 'Planning' }).filter({ visible: true }).click()
  await expect(slot(page, 1, 'Soir').getByRole('link', { name: 'Curry express' })).toBeVisible()

  // Suppression bloquée tant que la recette est au planning
  await slot(page, 1, 'Soir').getByRole('link', { name: 'Curry express' }).click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  const blocked = page.getByRole('alertdialog', { name: 'Suppression impossible' })
  await expect(blocked).toContainText(`${dayLabel(1)} · Soir`)
  await expect(blocked.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  await blocked.getByRole('button', { name: 'Annuler' }).click()

  // Une fois retirée du planning, la suppression fonctionne
  await page.getByRole('link', { name: 'Planning' }).filter({ visible: true }).click()
  await mealAction(page, 'Curry express', 'Supprimer')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(slot(page, 1, 'Soir').getByText('Aucun repas prévu')).toBeVisible()
  await page.getByRole('link', { name: 'Recettes' }).filter({ visible: true }).click()
  await page.getByRole('link', { name: /Curry express/ }).click()
  await page.getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('alertdialog', { name: 'Supprimer cette recette ?' }).getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Aucune recette', { exact: true })).toBeVisible()
})

test('une recette ponctuelle peut être sauvegardée depuis le planning', async ({ page }) => {
  await addAdhocMeal(page, 0, 'Midi', 'Quiche de mamie', { url: 'https://exemple.fr/quiche' })

  await page.getByRole('link', { name: 'Recettes' }).filter({ visible: true }).click()
  await expect(page.getByText('Aucune recette', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Planning' }).filter({ visible: true }).click()
  await mealAction(page, 'Quiche de mamie', 'Sauvegarder la recette')
  await expect(page.getByRole('heading', { name: 'Sauvegarder la recette' })).toBeVisible()
  await expect(page.getByLabel('Titre')).toHaveValue('Quiche de mamie')
  await expect(page.getByLabel('Lien', { exact: true })).toHaveValue('https://exemple.fr/quiche')

  await page.getByRole('button', { name: 'Sauvegarder la recette' }).click()
  await expect(page.getByText('Ajoute au moins un ingrédient')).toBeVisible()
  await page.getByLabel("Nom de l'ingrédient 1").fill('Lardons')
  await page.getByRole('button', { name: 'Sauvegarder la recette' }).click()

  // Retour au planning : le repas pointe maintenant vers la recette sauvegardée
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
  await expect(slot(page, 0, 'Midi').getByRole('link', { name: 'Quiche de mamie' })).toBeVisible()
  await page.getByRole('link', { name: 'Recettes' }).filter({ visible: true }).click()
  await expect(page.getByRole('link', { name: /Quiche de mamie/ })).toBeVisible()
})

test('préremplit une recette depuis un lien (analyse simulée)', async ({ page }) => {
  // L'Edge Function est simulée : le test ne dépend ni du site ni du modèle.
  let requested: unknown = null
  await page.route('**/functions/v1/import-recipe', async (route) => {
    requested = route.request().postDataJSON()
    await route.fulfill({
      json: {
        recipe: {
          title: 'Pâte à crêpes',
          servings: 4,
          ingredients: [
            { name: 'farine', quantity: 250, unit: 'g' },
            { name: 'œufs', quantity: 3, unit: null },
          ],
          steps: '1. Mélanger.\n2. Cuire à la poêle.',
          tags: ['dessert'],
        },
        source: 'structured',
        image: { data: PNG.toString('base64'), type: 'image/png' },
      },
    })
  })

  await page.goto('/recettes/nouvelle')
  await page.getByLabel('Lien de la recette à importer').fill('https://www.marmiton.org/recettes/crepes.aspx')
  await page.getByRole('button', { name: 'Préremplir' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Recette préremplie depuis marmiton.org' })).toBeVisible()
  expect(requested).toMatchObject({ url: 'https://www.marmiton.org/recettes/crepes.aspx' })

  await expect(page.getByLabel('Titre')).toHaveValue('Pâte à crêpes')
  await expect(page.getByLabel("Nom de l'ingrédient 2")).toHaveValue('œufs')
  await expect(page.getByTestId('photo-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page.getByRole('heading', { name: 'Pâte à crêpes' })).toBeVisible()
  await expect(page.getByText('250 g farine')).toBeVisible()
  await expect(page.getByText('4 portions')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Pâte à crêpes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voir la recette en ligne' })).toHaveAttribute('href', 'https://www.marmiton.org/recettes/crepes.aspx')
})

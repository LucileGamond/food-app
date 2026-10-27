import AxeBuilder from '@axe-core/playwright'
import { expect, login, test } from './fixtures'

// Image PNG 1×1 : le contenu n'importe pas, la lecture par le modèle est simulée (aucun appel réel).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('importe la recette à laquelle renvoie un ingrédient, puis la lie', async ({ page }) => {
  await page.route('**/functions/v1/import-recipe', (route) =>
    route.fulfill({
      json: {
        recipe: {
          title: 'Pâte sucrée',
          servings: null,
          ingredients: [
            { name: 'farine', quantity: 250, unit: 'g', note: null, section: null },
            { name: 'beurre', quantity: 125, unit: 'g', note: null, section: null },
          ],
          source: null,
          steps: '1. Sablez la farine et le beurre.',
          tags: [],
          checks: [],
        },
        source: 'photo',
        image: null,
      },
    }),
  )
  await login(page)

  // Recette principale qui renvoie à deux autres pages
  await page.goto('/recettes/nouvelle')
  await page.getByLabel('Titre', { exact: true }).fill('Tarte à la banane')
  await page.getByLabel('Source').fill('Pâtisserie maison, p. 146')
  await page.getByLabel("Nom de l'ingrédient 1").fill('pâte sucrée')
  await page.getByLabel("Quantité de l'ingrédient 1").fill('200')
  await page.getByLabel("Unité de l'ingrédient 1").selectOption('g')
  await page.getByLabel("Précision de l'ingrédient 1").fill('voir p. 208')
  await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click()
  await page.getByLabel("Nom de l'ingrédient 2").fill('streusel')
  await page.getByLabel("Précision de l'ingrédient 2").fill('voir p. 40')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Proposition après l'enregistrement
  const offer = page.getByRole('dialog', { name: 'Recettes liées' })
  await expect(offer.getByRole('listitem')).toHaveCount(2)
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  await offer.getByRole('button', { name: 'Importer pâte sucrée' }).click()

  // Sous-recette lue sur la photo de la page 208
  await expect(page.getByRole('note')).toContainText('Recette de « pâte sucrée » (p. 208) pour « Tarte à la banane »')
  await expect(page.getByLabel('Source')).toHaveValue('Pâtisserie maison, p. 208')
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'page-208.png', mimeType: 'image/png', buffer: PNG_1PX })
  await page.getByRole('button', { name: 'Lire la recette' }).click()
  await expect(page.getByLabel("Nom de l'ingrédient 2")).toHaveValue('beurre')
  await expect(page.getByLabel('Source')).toHaveValue('Pâtisserie maison, p. 208')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Retour sur la tarte : le renvoi restant est proposé, puis gardé pour plus tard
  const rest = page.getByRole('dialog', { name: 'Recettes liées' })
  await expect(rest.getByRole('listitem')).toHaveCount(1)
  await expect(rest).toContainText('streusel · p. 40')
  await rest.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: 'Tarte à la banane' })).toBeVisible()
  await page.screenshot({ path: `test-results/layout/recettes-liees-${test.info().project.name}.png`, fullPage: true })

  // Lien vers la sous-recette, qui ne renvoie pas à la tarte
  await page.getByRole('link', { name: 'Recette : Pâte sucrée' }).click()
  await expect(page.getByRole('heading', { name: 'Pâte sucrée' })).toBeVisible()
  await expect(page.getByText('Pâtisserie maison, p. 208')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Recette :/ })).toHaveCount(0)
  // Utilisée par la tarte : elle ne peut pas être supprimée
  await page.getByRole('button', { name: 'Supprimer' }).click()
  const blocked = page.getByRole('alertdialog', { name: 'Suppression impossible' })
  await expect(blocked.getByRole('link', { name: 'Tarte à la banane' })).toBeVisible()
  await expect(blocked.getByRole('button', { name: 'Supprimer' })).toBeDisabled()
  await blocked.getByRole('button', { name: 'Annuler' }).click()
  await page.goBack()

  // Le second renvoi se lie à une recette existante
  await page.getByRole('button', { name: 'Lier streusel à une recette existante' }).click()
  const picker = page.getByRole('dialog', { name: 'Lier à une recette' })
  await picker.getByRole('radiogroup', { name: 'Recettes sauvegardées' }).getByText('Pâte sucrée').click()
  await picker.getByRole('button', { name: 'Lier' }).click()
  await expect(page.getByRole('link', { name: 'Recette : Pâte sucrée' })).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Importer/ })).toHaveCount(0)
})

import { addAdhocMeal, dayLabel, dragTo, expect, login, mealAction, slot, test } from './fixtures'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('affiche 7 jours et navigue de semaine en semaine', async ({ page }) => {
  await expect(page.getByTestId('day-card')).toHaveCount(7)
  await expect(page.getByRole('article', { name: dayLabel(0) })).toContainText("Aujourd'hui")
  await expect(page.getByRole('button', { name: "Aujourd'hui" })).toBeDisabled()

  await page.getByRole('button', { name: 'Semaine suivante' }).click()
  await expect(page.getByRole('article', { name: dayLabel(7) })).toBeVisible()
  await expect(page.getByRole('article', { name: dayLabel(0) })).toHaveCount(0)

  await page.getByRole('button', { name: 'Semaine précédente' }).click()
  await page.getByRole('button', { name: 'Semaine précédente' }).click()
  await expect(page.getByRole('article', { name: dayLabel(-7) })).toBeVisible()

  await page.getByRole('button', { name: "Aujourd'hui" }).click()
  await expect(page.getByRole('article', { name: dayLabel(0) })).toBeVisible()
})

test('ajoute, modifie, déplace, duplique et supprime un repas', async ({ page }) => {
  await addAdhocMeal(page, 0, 'Midi', 'Pâtes tomate', { notes: 'Recette : https://exemple.fr/pates' })
  const lunch = slot(page, 0, 'Midi')
  await expect(lunch.getByRole('link', { name: 'exemple.fr/pates' })).toHaveAttribute('href', 'https://exemple.fr/pates')
  await expect(lunch.getByText('Lucile', { exact: true })).toBeVisible()
  await expect(page.getByRole('article', { name: dayLabel(0) })).toContainText('1 repas')

  // Modifier : ajouter Eric
  await mealAction(page, 'Pâtes tomate', 'Modifier')
  const edit = page.getByRole('dialog', { name: 'Modifier le repas' })
  await expect(edit.getByLabel('Titre')).toHaveValue('Pâtes tomate')
  await edit.getByRole('checkbox', { name: 'Eric' }).click()
  await edit.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(lunch.getByText('Eric et Lucile')).toBeVisible()

  // Déplacer via le menu vers demain soir
  await mealAction(page, 'Pâtes tomate', 'Déplacer…')
  const move = page.getByRole('dialog', { name: 'Déplacer le repas' })
  await move.getByLabel('Jour').selectOption({ label: dayLabel(1) })
  await move.getByLabel('Créneau').selectOption({ label: 'Soir' })
  await move.getByRole('button', { name: 'Déplacer' }).click()
  await expect(slot(page, 1, 'Soir').getByText('Pâtes tomate')).toBeVisible()
  await expect(lunch.getByText('Pâtes tomate')).toHaveCount(0)

  // Dupliquer via le menu vers après-demain midi
  await mealAction(page, 'Pâtes tomate', 'Dupliquer…')
  const dup = page.getByRole('dialog', { name: 'Dupliquer le repas' })
  await dup.getByLabel('Jour').selectOption({ label: dayLabel(2) })
  await dup.getByLabel('Créneau').selectOption({ label: 'Midi' })
  await dup.getByRole('button', { name: 'Dupliquer' }).click()
  await expect(slot(page, 2, 'Midi').getByText('Pâtes tomate')).toBeVisible()
  await expect(slot(page, 1, 'Soir').getByText('Pâtes tomate')).toBeVisible()

  // Persistance
  await page.reload()
  await expect(slot(page, 2, 'Midi').getByText('Pâtes tomate')).toBeVisible()

  // Supprimer avec confirmation
  await mealAction(page, 'Pâtes tomate', 'Supprimer')
  const confirm = page.getByRole('alertdialog', { name: 'Supprimer ce repas ?' })
  await expect(confirm).toContainText('Eric et Lucile')
  await confirm.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Pâtes tomate')).toHaveCount(1)
})

test('plusieurs repas dans un même créneau', async ({ page }) => {
  await addAdhocMeal(page, 0, 'Soir', 'Curry pour Lucile')
  await addAdhocMeal(page, 0, 'Soir', 'Pizza pour Eric')
  await expect(slot(page, 0, 'Soir').getByTestId('meal-item')).toHaveCount(2)
  await expect(page.getByRole('article', { name: dayLabel(0) })).toContainText('2 repas')
})

test('déplace et duplique par glisser-déposer', async ({ page, isMobile }) => {
  await addAdhocMeal(page, 0, 'Midi', 'Salade')

  await dragTo(page, slot(page, 0, 'Midi').getByTestId('meal-item'), slot(page, 1, 'Soir'), isMobile)
  await expect(slot(page, 1, 'Soir').getByText('Salade')).toBeVisible()
  await expect(slot(page, 0, 'Midi').getByText('Salade')).toHaveCount(0)

  // Cible juste au-dessus : sur mobile, le bas de l'écran est occupé par la barre d'onglets.
  await dragTo(page, page.getByRole('button', { name: 'Glisser pour dupliquer Salade' }), slot(page, 1, 'Midi'), isMobile)
  await expect(slot(page, 1, 'Midi').getByText('Salade')).toBeVisible()
  await expect(slot(page, 1, 'Soir').getByText('Salade')).toBeVisible()

  await page.reload()
  await expect(slot(page, 1, 'Midi').getByText('Salade')).toBeVisible()
  await expect(slot(page, 1, 'Soir').getByText('Salade')).toBeVisible()
})

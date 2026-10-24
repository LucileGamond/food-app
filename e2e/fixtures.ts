import { test as base, expect, type Page } from '@playwright/test'
import { ERIC, LUCILE, TEST_PASSWORD, resetData } from '../tests/integration/helpers'

export { ERIC, LUCILE, expect }

export async function login(page: Page, email = LUCILE.email) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
}

/** Date du jour au format « Mardi 20 octobre », comme dans l'application. */
export function dayLabel(offset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const text = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function slot(page: Page, offset: number, label: 'Midi' | 'Soir') {
  return page.getByRole('region', { name: `${dayLabel(offset)} — ${label}` })
}

export async function addAdhocMeal(page: Page, offset: number, label: 'Midi' | 'Soir', title: string, extra: { notes?: string; url?: string } = {}) {
  await page.getByRole('button', { name: `Ajouter un repas — ${dayLabel(offset)}, ${label}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter un repas' })
  await dialog.getByLabel('Titre').fill(title)
  if (extra.notes) await dialog.getByLabel('Notes').fill(extra.notes)
  if (extra.url) await dialog.getByLabel('Lien de la recette').fill(extra.url)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()
  await expect(slot(page, offset, label).getByText(title, { exact: true })).toBeVisible()
}

export async function mealAction(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `Actions pour ${title}` }).first().click()
  await page.getByRole('menuitem', { name: action }).click()
}

/** Chaque test part d'une base vide (comptes conservés). */
export const test = base.extend<{ cleanDb: void }>({
  cleanDb: [
    // oxlint-disable-next-line no-empty-pattern -- signature imposée par Playwright
    async ({}, use) => {
      await resetData()
      await use()
    },
    { auto: true },
  ],
})

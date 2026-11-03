import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { ERIC, LUCILE, TEST_PASSWORD, resetData } from '../tests/integration/helpers'

export { ERIC, LUCILE, expect }

export async function login(page: Page, email = LUCILE.email) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
}

/** Ouvre une page depuis la navigation (sur téléphone, les pages au-delà de 5 sont dans « Plus »). */
export async function openNavPage(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true })
  const link = nav.getByRole('link', { name, exact: true })
  if ((await link.count()) === 0) {
    await nav.getByRole('button', { name: 'Plus' }).click()
    await page.getByRole('menuitem', { name }).click()
  } else {
    await link.click()
  }
}

/** Page présente dans la navigation (onglet, ou entrée du menu « Plus »). */
export async function navHasPage(page: Page, name: string): Promise<boolean> {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true })
  if ((await nav.getByRole('link', { name, exact: true }).count()) > 0) return true
  const more = nav.getByRole('button', { name: 'Plus' })
  if ((await more.count()) === 0) return false
  await more.click()
  const found = (await page.getByRole('menuitem', { name }).count()) > 0
  await page.keyboard.press('Escape')
  return found
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
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(slot(page, offset, label).getByText(title, { exact: true })).toBeVisible()
}

export async function mealAction(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `Actions pour ${title}` }).first().click()
  await page.getByRole('menuitem', { name: action }).click()
}

/** Glisser-déposer à la souris (desktop) ou au doigt avec appui long (mobile). */
export async function dragTo(page: Page, source: Locator, target: Locator, isMobile: boolean) {
  await source.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const start = { x: from.x + from.width / 2, y: from.y + Math.min(from.height / 2, 20) }

  if (!isMobile) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 10, start.y + 10, { steps: 5 })
    await target.scrollIntoViewIfNeeded()
    const to = (await target.boundingBox())!
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
    await page.mouse.up()
    return
  }

  const cdp = await page.context().newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', start.x, start.y)
  await page.waitForTimeout(400) // appui long
  await touch('touchMove', start.x, start.y + 4)
  const to = (await target.boundingBox())!
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', start.x + ((end.x - start.x) * i) / 12, start.y + ((end.y - start.y) * i) / 12)
  }
  await touch('touchEnd', end.x, end.y)
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

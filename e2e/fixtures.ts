import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { ERIC, LUCILE, TEST_PASSWORD, resetData } from '../tests/integration/helpers'

export { ERIC, LUCILE, expect }

export async function login(page: Page, email = LUCILE.email) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // Accueil « Aujourd’hui », puis le planning (point de départ des parcours).
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible()
  await page.goto('/planning')
  await expect(page.getByRole('heading', { name: 'Planning' })).toBeVisible()
}

/** Section de chaque page qui n'est pas elle-même une section (téléphone : ses pages sont en haut de l'écran). */
const PAGE_SECTIONS: Record<string, string> = { Planning: 'Repas', Recettes: 'Repas', Courses: 'Repas', Poids: 'Santé', Plan: 'Santé', Eau: 'Santé' }

/** Ouvre une page depuis la navigation (sur téléphone : l'onglet de sa section, puis la page en haut de l'écran). */
export async function openNavPage(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true })
  const link = nav.getByRole('link', { name, exact: true })
  if ((await link.count()) > 0) return link.click()
  await nav.getByRole('link', { name: PAGE_SECTIONS[name], exact: true }).click()
  await page.getByRole('navigation', { name: `Pages de la section ${PAGE_SECTIONS[name]}` }).getByRole('link', { name, exact: true }).click()
}

/** Page présente dans la navigation (lien direct, ou page de sa section sur téléphone). */
export async function navHasPage(page: Page, name: string): Promise<boolean> {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' }).filter({ visible: true })
  if ((await nav.getByRole('link', { name, exact: true }).count()) > 0) return true
  const section = nav.getByRole('link', { name: PAGE_SECTIONS[name], exact: true })
  if (!PAGE_SECTIONS[name] || (await section.count()) === 0) return false
  await section.click()
  const pages = page.getByRole('navigation', { name: `Pages de la section ${PAGE_SECTIONS[name]}` })
  // Section d'une seule page affichée : pas de pages en haut de l'écran, la section ouvre directement cette page.
  if ((await pages.count()) === 0) return (await page.getByRole('heading', { name, exact: true, level: 1 }).count()) > 0
  return (await pages.getByRole('link', { name, exact: true }).count()) > 0
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

  // Au doigt, la page ne défile pas pendant le glisser : source et cible doivent être visibles toutes les deux.
  const viewport = page.viewportSize()!
  const below = (await target.boundingBox())!
  // 96 px : barre d'onglets du bas (fixe), plus une marge.
  const overflow = below.y + below.height + 96 - viewport.height
  if (overflow > 0) {
    // Défile juste assez pour voir la cible, sans faire sortir la source par le haut (sous l'en-tête).
    await page.mouse.wheel(0, Math.min(overflow, from.y - 72))
    await page.waitForTimeout(150)
  }
  const shown = (await source.boundingBox())!
  start.x = shown.x + shown.width / 2
  start.y = shown.y + Math.min(shown.height / 2, 20)

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

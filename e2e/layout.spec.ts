import type { Locator, Page } from '@playwright/test'
import { addDays, todayIso } from '../src/lib/dates'
import { signedInApi } from '../tests/integration/helpers'
import { ERIC, LUCILE, dayLabel, expect, login, test } from './fixtures'

// Revue de mise en page : chaque écran et chaque fenêtre, sur ordinateur et sur un petit téléphone (360 px),
// avec des contenus longs. Aucun élément ne doit dépasser de l'écran ou de sa fenêtre.

const LONG_TITLE = 'Gratin dauphinois de grand-mère aux pommes de terre fondantes et au comté affiné 24 mois'
const LONG_URL = 'https://www.une-tres-longue-adresse-de-site-de-cuisine.example/recettes/plats/gratin-dauphinois-de-grand-mere-au-comte'

async function seed() {
  const { api } = await signedInApi()
  const today = todayIso()
  const recipe = await api.recipes.saveRecipe({
    id: null,
    title: LONG_TITLE,
    notes: '1. Éplucher les pommes de terre.\n2. Les couper en fines rondelles.\n3. Cuire 1 h à 180 °C.',
    url: LONG_URL,
    servings: 4,
    tags: ['végé', 'familial', 'four', 'hiver', 'comfort food'],
    ingredients: [
      { name: 'pommes de terre à chair ferme de type charlotte', quantity: 1.25, unit: 'kg', note: 'épluchées et coupées en rondelles très fines' },
      { name: 'crème fraîche épaisse', quantity: 20, unit: 'cl', note: null },
      { name: 'ail', quantity: 2, unit: 'gousse', note: null },
    ],
  })
  for (let i = 0; i < 4; i++) {
    await api.recipes.saveRecipe({ id: null, title: `${LONG_TITLE} n° ${i + 2}`, notes: null, url: null, servings: 2, tags: ['rapide', 'été'], ingredients: [{ name: 'riz', quantity: 1, unit: 'kg', note: null }] })
  }
  await api.meals.createMeal({ date: today, slot: 'LUNCH', people: [LUCILE.id, ERIC.id], source: { kind: 'saved', recipeId: recipe } })
  await api.meals.createMeal({
    date: today,
    slot: 'DINNER',
    people: [LUCILE.id],
    source: { kind: 'adhoc', title: LONG_TITLE, notes: `Voir ${LONG_URL} pour les détails`, url: LONG_URL },
  })
  await api.meals.createMeal({ date: addDays(today, 1), slot: 'DINNER', people: [ERIC.id], source: { kind: 'adhoc', title: 'Raclette', notes: '', url: '' } })
  await api.inbox.addItem({ url: LONG_URL, title: LONG_TITLE })
  await api.inbox.addItem({ title: 'Idée : soupe' })

  await api.food.savePlanItem(LUCILE.id, { meal: 'LUNCH', category: 'Produits laitiers et fromages', name: LONG_TITLE, quantity: 125, unit: 'g', allowed_occurrences: 3 })
  await api.food.savePlanItem(LUCILE.id, { meal: 'BREAKFAST', category: 'Fruits', name: 'Pomme', quantity: null, unit: null, allowed_occurrences: 14 })
  await api.food.createPeriod(LUCILE.id, today, addDays(today, 13))

  await api.weights.saveWeighIn(addDays(today, -10), [
    { profile_id: LUCILE.id, weight_kg: 62.4 },
    { profile_id: ERIC.id, weight_kg: 81.2 },
  ])
  await api.weights.saveWeighIn(today, [
    { profile_id: LUCILE.id, weight_kg: 61.8 },
    { profile_id: ERIC.id, weight_kg: 80.5 },
  ])

  const list = await api.shopping.createList('Courses de la semaine avec un nom de liste assez long pour tester')
  await api.shopping.addItems(
    list,
    [
      { name: 'Pommes de terre à chair ferme de type charlotte pour gratin', quantity: 1250, unit: 'g', aisle: 'FRUITS_LEGUMES' },
      { name: 'Crème fraîche', quantity: 20, unit: 'cl', aisle: 'CREMERIE' },
      { name: 'Ail', quantity: 2, unit: 'gousse', aisle: 'FRUITS_LEGUMES' },
    ],
    0,
  )
  return { recipe, list }
}

/** Éléments qui dépassent de l'écran, ou de la fenêtre ouverte (en tenant compte des zones qui défilent ou rognent). */
async function overflowIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth
    const issues: string[] = []
    if (document.documentElement.scrollWidth > viewport + 1) issues.push(`page plus large que l'écran (${document.documentElement.scrollWidth} > ${viewport})`)
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role=dialog],[role=alertdialog]')].filter((d) => d.getBoundingClientRect().width > 0)
    const roots = dialogs.length > 0 ? dialogs : [document.body]
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''} « ${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)} »`
    for (const root of roots) {
      const rootRect = root.getBoundingClientRect()
      if (rootRect.left < -1 || rootRect.right > viewport + 1) issues.push(`fenêtre hors de l'écran : ${describe(root)}`)
      if (root !== document.body && root.scrollWidth > root.clientWidth + 1) issues.push(`défilement horizontal dans ${describe(root)}`)
      const reported: Element[] = []
      for (const el of root.querySelectorAll<HTMLElement>('*')) {
        if (el.closest('.sr-only, [data-sonner-toaster]') || reported.some((r) => r.contains(el))) continue
        const rect = el.getBoundingClientRect()
        if (rect.width <= 1 || rect.height <= 1) continue
        // Limite : le plus proche parent qui rogne ou fait défiler horizontalement, sinon la fenêtre (ou l'écran).
        let bound: DOMRect = root === document.body ? new DOMRect(0, 0, viewport, 0) : rootRect
        for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== 'visible') {
            bound = p.getBoundingClientRect()
            break
          }
        }
        if (rect.right > bound.right + 1 || rect.left < bound.left - 1) {
          reported.push(el)
          issues.push(`${describe(el)} dépasse de ${Math.round(Math.max(rect.right - bound.right, bound.left - rect.left))} px`)
        }
      }
    }
    return issues
  })
}

const problems: string[] = []
let viewName = ''

async function check(page: Page, name: string, locator?: Locator) {
  if (locator) await expect(locator).toBeVisible()
  await page.waitForTimeout(250) // fin des animations d'ouverture
  await page.screenshot({ path: `test-results/layout/${viewName}/${name}.png`, fullPage: !locator })
  for (const issue of await overflowIssues(page)) {
    problems.push(`[${viewName}] ${name} : ${issue}`)
    console.log(`DÉBORDEMENT [${viewName}] ${name} : ${issue}`)
  }
}

async function closeDialog(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('aucun écran ni aucune fenêtre ne déborde', async ({ page, isMobile }) => {
  test.setTimeout(180_000)
  problems.length = 0
  viewName = isMobile ? 'telephone' : 'ordinateur'
  if (isMobile) await page.setViewportSize({ width: 360, height: 780 })
  const { recipe, list } = await seed()
  await page.route('**/functions/v1/import-recipe', (route) => route.fulfill({ json: { title: LONG_TITLE } }))
  await login(page)

  // Planning et ses fenêtres
  await page.goto('/planning')
  await expect(page.getByText('Raclette').first()).toBeVisible()
  await check(page, 'planning')

  await page.getByRole('button', { name: `Ajouter un repas — ${dayLabel(1)}, Midi` }).click()
  let dialog = page.getByRole('dialog', { name: 'Ajouter un repas' })
  await check(page, 'repas-ponctuel', dialog)
  await dialog.getByRole('tab', { name: 'Recette sauvegardée' }).click()
  await expect(dialog.getByRole('radio').first()).toBeAttached()
  await check(page, 'repas-recette-sauvegardee', dialog)
  await closeDialog(page)

  await page.getByRole('button', { name: `Actions pour ${LONG_TITLE}` }).first().click()
  await check(page, 'menu-repas', page.getByRole('menu'))
  await page.getByRole('menuitem', { name: 'Déplacer' }).click()
  await check(page, 'deplacer-repas', page.getByRole('dialog', { name: 'Déplacer le repas' }))
  await closeDialog(page)

  await page.getByRole('button', { name: `Actions pour ${LONG_TITLE}` }).first().click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await check(page, 'supprimer-repas', page.getByRole('alertdialog'))
  await page.keyboard.press('Escape')

  if (isMobile) await page.getByRole('button', { name: /À planifier/ }).click()
  await check(page, 'a-planifier')
  await page.getByRole('button', { name: `Planifier « ${LONG_TITLE} »` }).click()
  await check(page, 'planifier', page.getByRole('dialog', { name: 'Planifier' }))
  await closeDialog(page)

  await page.getByRole('button', { name: 'Liste de courses' }).click()
  dialog = page.getByRole('dialog', { name: 'Liste de courses' })
  await check(page, 'courses-repas', dialog)
  await dialog.getByRole('button', { name: /Préparer la liste/ }).click()
  await expect(dialog.getByRole('button', { name: /Créer la liste/ })).toBeVisible()
  await check(page, 'courses-apercu', dialog)
  await closeDialog(page)

  // Recettes
  await page.goto('/recettes')
  await expect(page.getByRole('link', { name: new RegExp(LONG_TITLE) }).first()).toBeVisible()
  await check(page, 'recettes')
  await page.goto(`/recettes/${recipe}`)
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()
  await check(page, 'recette')
  await page.goto(`/recettes/${recipe}/modifier`)
  await expect(page.getByLabel('Titre')).toHaveValue(LONG_TITLE)
  await check(page, 'recette-modifier')
  await page.goto('/recettes/import-serie')
  await page.getByLabel('Photos des pages').setInputFiles(
    Array.from({ length: 3 }, (_, i) => ({ name: `${'page-au-nom-tres-long-'.repeat(3)}${i}.png`, mimeType: 'image/png', buffer: Buffer.from('x') })),
  )
  await check(page, 'import-serie')
  await page.goto('/recettes/nouvelle')
  await expect(page.getByRole('button', { name: 'Préremplir' })).toBeVisible()
  await check(page, 'recette-nouvelle')

  // Plan alimentaire
  await page.goto('/plan')
  await expect(page.getByText('Jour 1 sur 14')).toBeVisible()
  await check(page, 'plan')
  await page.goto('/plan/modifier')
  await expect(page.getByRole('heading', { name: 'Plan alimentaire' })).toBeVisible()
  await check(page, 'plan-modifier')
  await page.getByRole('button', { name: 'Ajouter un aliment' }).first().click()
  await check(page, 'plan-aliment', page.getByRole('dialog', { name: 'Ajouter un aliment' }))
  await closeDialog(page)

  // Poids
  await page.goto('/poids')
  await expect(page.getByRole('button', { name: 'Nouvelle pesée' }).first()).toBeVisible()
  await check(page, 'poids')
  await page.getByRole('button', { name: 'Nouvelle pesée' }).first().click()
  await check(page, 'poids-pesee', page.getByRole('dialog', { name: 'Nouvelle pesée' }))
  await closeDialog(page)

  // Courses
  await page.goto('/courses')
  await expect(page.getByRole('list', { name: 'Listes de courses' })).toBeVisible()
  await check(page, 'listes')
  await page.getByRole('button', { name: 'Nouvelle liste' }).first().click()
  await check(page, 'listes-nouvelle', page.getByRole('dialog', { name: 'Nouvelle liste' }))
  await closeDialog(page)
  await page.goto(`/courses/${list}`)
  await expect(page.getByTestId('shopping-item')).toHaveCount(3)
  await check(page, 'liste')
  await page.getByRole('button', { name: /^Modifier Pommes de terre/ }).click()
  await check(page, 'liste-article', page.getByRole('dialog', { name: "Modifier l'article" }))
  await closeDialog(page)

  // Partage depuis le téléphone
  await page.goto(`/partage?text=${encodeURIComponent('Regarde : https://cuisine.exemple.fr/une-autre-recette-au-nom-tres-long-pour-voir')}`)
  await expect(page).toHaveURL(/\/planning/)
  await check(page, 'partage')

  expect(problems).toEqual([])
})

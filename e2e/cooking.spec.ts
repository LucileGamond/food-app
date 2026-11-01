import AxeBuilder from '@axe-core/playwright'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('cuisine une recette : ingrédients et étapes à cocher, en plein écran', async ({ page }) => {
  const { api } = await signedInApi()
  const id = await api.recipes.saveRecipe({
    id: null,
    title: 'Tarte aux pommes',
    notes: '1. Préchauffer le four à 180 °C.\n2. Étaler la pâte.\n3. Cuire 30 min.',
    url: null,
    servings: 4,
    tags: [],
    ingredients: [
      { name: 'pommes', quantity: 4, unit: null, note: null },
      { name: 'sucre', quantity: 50, unit: 'g', note: null },
    ],
  })

  await login(page)
  await page.goto(`/recettes/${id}`)
  await page.getByRole('button', { name: 'Une personne de plus' }).click()
  await page.getByRole('link', { name: 'Cuisiner' }).click()

  // Plein écran : pas de navigation de l'application.
  await expect(page.getByRole('heading', { name: 'Tarte aux pommes' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '5 pommes' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Étape/ })).toHaveCount(3)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await page.getByRole('checkbox', { name: '5 pommes' }).click()
  await page.getByRole('checkbox', { name: 'Étape 1 faite' }).click()
  await expect(page.locator('[aria-current="step"]')).toContainText('Étaler la pâte.')

  // Quitter puis revenir (un autre jour) : la progression est gardée en base.
  await page.getByRole('link', { name: 'Quitter le mode cuisine' }).first().click()
  await page.getByRole('link', { name: 'Reprendre · étape 2/3' }).click()
  // Reprise avec le nombre de personnes de la séance (5), pas celui de la recette.
  await expect(page.getByRole('checkbox', { name: '5 pommes' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('checkbox', { name: 'Étape 1 faite' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('checkbox', { name: 'Étape 2 faite' }).click()
  await page.getByRole('checkbox', { name: 'Étape 3 faite' }).click()
  await expect(page.getByRole('status')).toContainText('Bon appétit')

  // Terminer : la progression est effacée.
  await page.getByRole('button', { name: 'Terminer la recette' }).last().click()
  await expect(page.getByRole('link', { name: 'Cuisiner' })).toBeVisible()
})

test('minuteurs du mode cuisine, et fiche à imprimer', async ({ page }) => {
  const { api } = await signedInApi()
  const id = await api.recipes.saveRecipe({
    id: null,
    title: 'Riz au lait',
    notes: '1. Porter le lait à ébullition.\n2. Cuire 25 à 30 min à feu doux.',
    url: null,
    servings: 4,
    tags: [],
    ingredients: [{ name: 'riz rond', quantity: 100, unit: 'g', note: null }],
  })
  await page.addInitScript(() => {
    ;(window as Window & { printed?: number }).printed = 0
    window.print = () => void ((window as Window & { printed?: number }).printed! += 1)
  })

  await login(page)
  await page.goto(`/recettes/${id}/cuisiner`)
  // La durée de l'étape lance un minuteur (la plus courte de la fourchette).
  await page.getByRole('button', { name: 'Lancer un minuteur de 25 à 30 min' }).click()
  const bar = page.getByRole('region', { name: 'Minuteurs' })
  await expect(bar.getByText('Étape 2 · 25 min')).toBeVisible()
  await expect(bar.getByText(/^(24:5\d|25:00)$/)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // Rechargement : le minuteur continue.
  await bar.getByRole('button', { name: 'Mettre en pause : Étape 2 · 25 min' }).click()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Minuteurs' }).getByRole('button', { name: 'Reprendre : Étape 2 · 25 min' })).toBeVisible()
  await page.getByRole('region', { name: 'Minuteurs' }).getByRole('button', { name: 'Supprimer : Étape 2 · 25 min' }).click()
  await expect(page.getByRole('region', { name: 'Minuteurs' })).toHaveCount(0)

  // Fiche à imprimer : quantités pour le nombre de personnes choisi, boîte d'impression ouverte d'elle-même.
  await page.goto(`/recettes/${id}`)
  await page.getByRole('button', { name: 'Une personne de plus' }).click()
  await page.getByRole('link', { name: 'Imprimer / PDF' }).click()
  await expect(page.getByRole('heading', { name: 'Riz au lait' })).toBeVisible()
  await expect(page.getByText('125 g riz rond')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as Window & { printed?: number }).printed)).toBe(1)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('mode vocal : étapes et minuteur à la voix', async ({ page }) => {
  const { api } = await signedInApi()
  const id = await api.recipes.saveRecipe({
    id: null,
    title: 'Pâtes au beurre',
    notes: '1. Faire bouillir l’eau.\n2. Cuire les pâtes 10 min.',
    url: null,
    servings: 2,
    tags: [],
    ingredients: [{ name: 'pâtes', quantity: 200, unit: 'g', note: null }],
  })
  // Pas de micro dans le navigateur de test : reconnaissance et voix simulées ; window.say() « dit » une phrase.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const spoken: string[] = []
    w.spoken = spoken
    class FakeRecognition {
      lang = ''
      continuous = false
      interimResults = false
      onresult: ((event: unknown) => void) | null = null
      onerror: ((event: unknown) => void) | null = null
      onend: (() => void) | null = null
      constructor() {
        w.say = (text: string) => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] })
      }
      start() {}
      stop() {}
      abort() {}
    }
    w.SpeechRecognition = FakeRecognition
    w.webkitSpeechRecognition = FakeRecognition
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel() {}, speak: (u: { text: string; onend?: () => void }) => (spoken.push(u.text), u.onend?.()) },
    })
  })
  // Une seconde après la voix du téléphone : juste après, ce qui est entendu est ignoré (écho).
  const say = async (text: string) => {
    await page.waitForTimeout(1000)
    await page.evaluate((t) => (window as unknown as { say: (t: string) => void }).say(t), text)
  }
  const lastSpoken = () => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken.at(-1))

  await login(page)
  await page.goto(`/recettes/${id}/cuisiner`)
  await page.getByRole('button', { name: 'Activer le mode vocal' }).click()
  await expect.poll(lastSpoken).toBe('Mode vocal activé. Étape 1. Faire bouillir l’eau.')
  await expect(page.getByRole('region', { name: 'Mode vocal' })).toContainText('J’écoute')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await say('étape suivante')
  await expect.poll(lastSpoken).toBe('Étape 2. Cuire les pâtes 10 min.')
  await expect(page.getByRole('checkbox', { name: 'Étape 1 faite' })).toHaveAttribute('aria-checked', 'true')
  await say('lance le minuteur')
  await expect.poll(lastSpoken).toBe('Minuteur de 10 minutes lancé.')
  await expect(page.getByRole('region', { name: 'Minuteurs' }).getByText('Étape 2 · 10 min')).toBeVisible()

  await page.getByRole('button', { name: 'Couper le mode vocal' }).click()
  await expect(page.getByRole('button', { name: 'Activer le mode vocal' })).toBeVisible()
})

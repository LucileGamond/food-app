import { axeFor } from './support/a11y'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { ERIC, expect, login, openNavPage, test } from './fixtures'

/** Jour du foyer (Paris), au format de la saisie de date. */
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Page Plantes activée dans les réglages (masquée par défaut), puis ouverte depuis la navigation. */
async function openPlants(page: Page) {
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await page.getByRole('checkbox', { name: 'Plantes' }).first().click()
  await openNavPage(page, 'Plantes')
  await expect(page.getByRole('heading', { name: 'Plantes', level: 1 })).toBeVisible()
}

/** Plante arrosée tous les jours à partir d'aujourd'hui (300 ml) : forcément à arroser. */
async function createPlant(page: Page, name: string, options: { location?: string; photo?: boolean } = {}) {
  await page.goto('/plantes/nouvelle')
  await page.getByLabel('Nom', { exact: true }).fill(name)
  if (options.location) await page.getByLabel('Emplacement').fill(options.location)
  if (options.photo) {
    await page.getByLabel('Choisir des photos').setInputFiles({
      name: 'plante.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
    })
  }
  await page.getByRole('button', { name: 'Ajouter une règle' }).click()
  const rule = page.getByRole('group', { name: /Règle 1/ })
  await rule.getByLabel('1er arrosage').fill(parisToday())
  await rule.getByLabel('Unité de fréquence de la règle 1').selectOption('day')
  await rule.getByLabel('Quantité', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

test('créer une plante avec photo et règle, l’arroser, voir qui l’a fait', async ({ page }) => {
  await login(page)
  await openPlants(page)
  await createPlant(page, 'Basilic', { location: 'Cuisine', photo: true })

  // Fiche : à arroser aujourd'hui, photo affichée
  await expect(page.getByText('À arroser aujourd’hui · 300 ml')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Basilic' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Règles d’arrosage' })).toContainText('300 ml tous les jours')

  // Liste « À arroser »
  await page.goto('/plantes')
  const toWater = page.getByRole('region', { name: /À arroser/ })
  await expect(toWater.getByRole('link', { name: 'Basilic' })).toBeVisible()
  await toWater.getByRole('button', { name: 'Marquer Basilic comme arrosée' }).click()
  await expect(page.getByText('Basilic : arrosage noté')).toBeVisible()

  const done = page.getByRole('region', { name: 'Déjà arrosées aujourd’hui' })
  await expect(done).toContainText(/Arrosée à \d+ h \d{2} par Lucile · 300 ml/)
  await expect(page.getByText('Tout est arrosé')).toBeVisible()

  // Historique sur la fiche
  await done.getByRole('link', { name: 'Basilic' }).click()
  const history = page.getByRole('list', { name: 'Historique des arrosages' })
  await expect(history).toContainText('Par Lucile · 300 ml')
  await expect(history).toContainText(/Prévu le/)

  // Annuler depuis la liste : de nouveau à arroser
  await page.goto('/plantes')
  await page.getByRole('button', { name: 'Annuler l’arrosage de Basilic' }).click()
  await expect(page.getByRole('region', { name: /À arroser/ }).getByRole('link', { name: 'Basilic' })).toBeVisible()
})

test('les arrosages de Lucile apparaissent en direct chez Eric', async ({ page, browser }) => {
  await login(page)
  await openPlants(page)
  await createPlant(page, 'Monstera')

  const ericContext = await browser.newContext()
  const eric = await ericContext.newPage()
  await login(eric, ERIC.email)
  await openPlants(eric)
  await expect(eric.getByRole('region', { name: /À arroser/ }).getByRole('link', { name: 'Monstera' })).toBeVisible()

  await page.goto('/plantes')
  await page.getByRole('button', { name: 'Marquer Monstera comme arrosée' }).click()

  await expect(eric.getByRole('region', { name: 'Déjà arrosées aujourd’hui' })).toContainText('par Lucile', { timeout: 15_000 })
  await ericContext.close()
})

test('modifier, rechercher, archiver puis supprimer une plante', async ({ page }) => {
  await login(page)
  await openPlants(page)
  await createPlant(page, 'Ficus', { location: 'Bureau' })
  await createPlant(page, 'Aloe', { location: 'Salon' })

  // Modification
  await page.getByRole('link', { name: 'Modifier' }).click()
  await page.getByLabel('Nom', { exact: true }).fill('Aloe vera')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Aloe vera', level: 1 })).toBeVisible()

  // Recherche et filtre
  await page.goto('/plantes?vue=toutes')
  await page.getByRole('searchbox', { name: 'Rechercher une plante' }).fill('fic')
  await expect(page.getByRole('list', { name: 'Liste des plantes' }).getByRole('heading')).toHaveText(['Ficus'])
  await page.getByRole('searchbox').fill('')
  await page.getByRole('group', { name: 'Filtrer par emplacement' }).getByRole('button', { name: 'Salon' }).click()
  await expect(page.getByRole('list', { name: 'Liste des plantes' }).getByRole('heading')).toHaveText(['Aloe vera'])

  // Archivage : plus de rappel
  await page.getByRole('list', { name: 'Liste des plantes' }).getByRole('link', { name: /Aloe vera/ }).click()
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('menuitem', { name: 'Archiver' }).click()
  await expect(page.getByText('Plante archivée : aucun rappel n’est envoyé.')).toBeVisible()

  // Suppression
  await page.getByRole('button', { name: 'Plus d’actions' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByRole('heading', { name: 'Plantes', level: 1 })).toBeVisible()
  await page.getByRole('tab', { name: /Toutes/ }).click()
  await expect(page.getByRole('list', { name: 'Liste des plantes' }).getByRole('heading')).toHaveText(['Ficus'])
})

test('validation des règles dans le formulaire', async ({ page }) => {
  await login(page)
  await openPlants(page)
  await page.goto('/plantes/nouvelle')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Donne un nom à la plante.')).toBeVisible()

  await page.getByLabel('Nom', { exact: true }).fill('Cactus')
  await page.getByRole('button', { name: 'Ajouter une règle' }).click()
  await page.getByRole('button', { name: 'Ajouter une règle' }).click()
  const rule2 = page.getByRole('group', { name: /Règle 2/ })
  await rule2.getByRole('button', { name: 'Toute l’année' }).click()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(rule2.getByText(/est déjà couvert par la règle 1/)).toBeVisible()
})

test('accessibilité des écrans des plantes', async ({ page }) => {
  await login(page)
  await openPlants(page)
  await createPlant(page, 'Cactus', { photo: true })
  for (const path of ['/plantes', '/plantes?vue=toutes', '/plantes/nouvelle']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  // Fiche d'une plante (avec photo)
  await page.goto('/plantes?vue=toutes')
  await page.getByRole('list', { name: 'Liste des plantes' }).getByRole('link', { name: /Cactus/ }).click()
  await expect(page.getByRole('heading', { name: 'Cactus', level: 1 })).toBeVisible()
  const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
})

test('l’accueil d’Eric montre en direct ce que Lucile a fait', async ({ page }) => {
  const lucile = await signedInApi()
  const eric = await signedInApi(ERIC.email)
  await eric.api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const plantId = await lucile.api.plants.savePlant({ name: 'Ficus', species: null, location: null, planted_on: null, planted_height_cm: null, pot_diameter_cm: null, notes: null }, [])

  await login(page, ERIC.email)
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Ce que l’autre a fait' })
  await expect(card.getByRole('link', { name: 'Lucile a ajouté la plante Ficus' })).toBeVisible()

  await lucile.api.plants.water({ plantId, scheduledOn: null, ruleId: null, amountMl: 200 })
  await card.getByRole('link', { name: 'Lucile a arrosé Ficus' }).click({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Ficus', level: 1 })).toBeVisible()
})

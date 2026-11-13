import { axeFor } from './support/a11y'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, openNavPage, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

const PATTERN = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  steps: [
    { title: 'Dos – côtes', instructions: 'Monter 64 m. et tricoter 18 rangs en côtes 1/1.', totalRows: 18, stitches: 64, sections: [] },
    {
      title: 'Emmanchures',
      instructions: 'Diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
      totalRows: 30,
      stitches: 56,
      sections: [{ kind: 'repeat', rows: null, every: null, times: 4, text: '1 diminution de chaque côté', pattern: 'tous les 5 cm' }],
    },
  ],
}

test('charge un patron PDF pour une taille, compte les rangs et retrouve son avancée', async ({ page }) => {
  // Lecture par le modèle simulée (pas d'appel réel).
  let sent: { size?: string; pdf?: string } = {}
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: PATTERN })
  })
  await login(page)

  // Module activé dans les réglages
  await page.getByRole('link', { name: 'Réglages' }).filter({ visible: true }).click()
  await page.getByRole('checkbox', { name: 'Tricot' }).click()
  await openNavPage(page, 'Tricot')
  await expect(page.getByText('Aucun projet')).toBeVisible()

  await page.getByRole('link', { name: 'Nouveau projet' }).first().click()
  await page.getByLabel('Patron (PDF)').setInputFiles({ name: 'bergamote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fin') })
  await page.getByLabel('Taille', { exact: true }).fill('M')
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  await expect(page.getByRole('list', { name: 'Étapes lues' }).locator(':scope > li')).toHaveCount(2)
  expect(sent.size).toBe('M')
  expect(sent.pdf).toBe(Buffer.from('%PDF-1.4\n%fin').toString('base64'))
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()

  // Projet en trois onglets : il s'ouvre sur « Démarrer » (aiguilles et échantillon à noter)
  await expect(page.getByRole('tab', { name: /1. Démarrer/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await expect(page.getByRole('navigation', { name: 'Étapes' }).getByRole('list').getByRole('link')).toHaveCount(2)
  // On tricote dans le mode tricoter, sur l'étape en cours
  await page.getByRole('tab', { name: /3. Tricoter/ }).click()
  await expectNoA11yViolations(page)
  await page.getByRole('link', { name: 'Tricoter', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dos – côtes' })).toBeVisible()
  const row = page.getByRole('region', { name: /à tricoter$/ })
  await expect(row.getByRole('heading')).toHaveText('Rang 1 à tricoter')
  await expect(page.getByText(/^Prochain :/)).toContainText('Dernier rang de l’étape, ensuite : Emmanchures')
  await expectNoA11yViolations(page)
  // Fin d'étape anticipée, confirmée : l'étape suivante s'ouvre
  await page.getByRole('button', { name: 'Terminer l’étape' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Terminer l’étape' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Emmanchures' })).toBeVisible()
  // « tous les 5 cm » à régler : l'étape n'est pas prête, rien ne se compte ; la liste renvoie vers la préparation
  const notReady = page.getByRole('alert')
  await expect(notReady).toContainText('Sous-étape 1 (1 diminution de chaque côté — tous les 5 cm (rangs à régler)) : rythme en rangs à régler.')
  await expect(page.getByRole('button', { name: 'Ajouter 1 rang' })).toHaveCount(0)
  await expectNoA11yViolations(page)
  await notReady.getByRole('link', { name: 'Préparer l’étape' }).click()
  await expect(page.getByRole('heading', { name: 'Emmanchures' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
  // Préparation : « tous les 5 cm » réglé à 6 rangs
  await expect(page.getByRole('region', { name: 'Sous-étapes' }).getByText('1 diminution de chaque côté — tous les 5 cm (rangs à régler)')).toBeVisible()
  await page.getByRole('button', { name: /^Actions pour « 1 diminution/ }).click()
  await page.getByRole('menuitem', { name: 'Modifier' }).click()
  await page.getByLabel('Tous les … rangs').fill('6')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Rangs 1 à 24 · prochaine fois : rang 6')).toBeVisible()
  // Section sans répétition ajoutée à la suite
  await page.getByRole('button', { name: 'Ajouter une sous-étape' }).click()
  await page.getByLabel('Nombre de rangs').fill('10')
  await page.getByLabel('Description (facultatif)').fill('côtes')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Sous-étapes' }).getByText('Rangs 25 à 34')).toBeVisible()
  // Retour au mode tricoter : 5 rangs terminés, le 6e est à tricoter, avec la diminution
  await page.getByRole('link', { name: 'Tricoter cette étape' }).click()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(row).toContainText('Rang 6 à tricoter1 diminution de chaque côté (1/4)')
  await expect(page.getByText(/^Prochain :/)).toHaveText('Prochain : rang 12, dans 6 — 1 diminution de chaque côté (2/4)')
  // 56 mailles à la fin, 4 diminutions de chaque côté devinées d'après le texte : 64 au départ, 62 après ce rang (estimé)
  await expect(row).toContainText('En fin de rang : 62 (?) mailles')
  await page.getByRole('button', { name: 'Patron' }).click()
  await page.getByLabel('Notes de l’étape', { exact: true }).fill('Aiguilles 4,5')
  // Recharger avant la fin de l'enregistrement des notes (parti au blur) l'annulerait : on attend la réponse.
  const notesSaved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/rest/v1/knit_steps') && (r.request().postData() ?? '').includes('Aiguilles 4,5'),
  )
  await page.getByLabel('Notes de l’étape', { exact: true }).blur()
  expect((await notesSaved).ok()).toBe(true)
  await expectNoA11yViolations(page)

  // Avancée enregistrée
  await page.reload()
  await expect(row).toContainText('Rang 6 à tricoter')
  await page.getByRole('button', { name: 'Patron' }).click()
  await expect(page.getByLabel('Notes de l’étape', { exact: true })).toHaveValue('Aiguilles 4,5')
  await page.getByRole('link', { name: 'Quitter le mode tricoter' }).click()
  // Plusieurs tailles : la taille suivie se lit dans le choix, pas en double dans l'en-tête
  await expect(page.getByText('Taille M · 1 / 2 étapes')).toBeVisible()

  // Liste des projets : l'étape en cours, et Tricoter d'un toucher ; puis suppression
  await page.getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('link', { name: /^Pull Bergamote/ })).toContainText('Taille M · étape 2 sur 2 : Emmanchures')
  await expect(page.getByRole('link', { name: /^Pull Bergamote/ })).toContainText(/5 \/ \d+ rangs/)
  await expect(page.getByRole('link', { name: 'Tricoter « Pull Bergamote »' })).toHaveAttribute('href', /\/tricoter$/)
  await page.getByRole('link', { name: /^Pull Bergamote/ }).click()
  await page.getByRole('button', { name: 'Supprimer le projet' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByText('Aucun projet')).toBeVisible()
})

test('ajoute un patron à la bibliothèque, le commence, puis note la laine (étiquette) et son échantillon', async ({ page }) => {
  // Lecture par le modèle simulée : patron (avec son échantillon) ou étiquette de laine.
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    const body = route.request().postDataJSON()
    if ('label' in body) {
      await route.fulfill({ json: { brand: 'Phildar', name: 'Partner 3.5', color: '0012 Ciel', dye_lot: '4471', composition: null, weight_g: 50, length_m: 125, needle_mm: 3.5 } })
    } else {
      await route.fulfill({ json: { ...PATTERN, gauge: { stitches: 22, rows: 30 } } })
    }
  })
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  await login(page)
  await openNavPage(page, 'Tricot')

  // Patron ajouté à la bibliothèque : PDF et photo d'une page, nom tiré du fichier
  await page.getByRole('link', { name: /Bibliothèque de patrons/ }).click()
  await expect(page.getByText('Aucun patron', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ajouter un patron' }).first().click()
  await page.getByLabel('PDF', { exact: true }).setInputFiles({ name: 'Gilet Rosée.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%gilet') })
  await expect(page.getByLabel('Nom du patron')).toHaveValue('Gilet Rosée')
  await page.getByLabel(/Choisir des photos/).setInputFiles({ name: 'page.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })
  await expect(page.getByRole('list', { name: 'Photos du patron' }).getByRole('listitem')).toHaveCount(1)
  await page.getByLabel('Taille visée').fill('M')
  await page.getByLabel('Envie').selectOption('Bientôt')
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  // Fiche du patron
  await expect(page.getByRole('heading', { level: 1, name: 'Gilet Rosée' })).toBeVisible()
  await expect(page.getByText('Bientôt · taille M')).toBeVisible()
  await expect(page.getByText('Pas encore tricoté.')).toBeVisible()
  await expectNoA11yViolations(page)
  // Dans la liste, avec ses formats
  await page.getByRole('link', { name: 'Bibliothèque', exact: true }).click()
  const library = page.getByRole('list', { name: 'Patrons' })
  await expect(library).toContainText('PDF · 1 photo')
  await library.getByRole('link', { name: /Gilet Rosée/ }).click()

  // Commencé : PDF et taille repris
  await page.getByRole('link', { name: 'Commencer un projet' }).click()
  await expect(page.getByRole('heading', { name: 'Commencer « Gilet Rosée »' })).toBeVisible()
  await expect(page.getByLabel('Taille', { exact: true })).toHaveValue('M')
  // PDF repris : il n'est pas redemandé
  await expect(page.getByText('Gilet Rosée.pdf')).toBeVisible()
  await expect(page.getByLabel('Patron (PDF)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  await expect(page.getByText(/échantillon 22 m\. × 30 rangs pour 10 cm/)).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()

  // Laine lue sur l'étiquette (onglet « Démarrer », carte ouverte)
  const panel = page.getByRole('region', { name: 'Laine et échantillon' })
  await panel.getByRole('button', { name: 'Ajouter une laine' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter une laine' })
  await dialog.getByLabel('Photo de l’étiquette').setInputFiles({
    name: 'etiquette.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
  })
  await expect(dialog.getByLabel('Marque')).toHaveValue('Phildar')
  await dialog.getByLabel(/Nombre de pelotes/).fill('6')
  await expectNoA11yViolations(page)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(panel).toContainText('Phildar Partner 3.5')
  await expect(panel).toContainText('Environ 750 m de laine en tout.')

  // Échantillon plus serré : mailles recalculées (64 → 70)
  const gauge = panel.getByRole('form', { name: 'Échantillon' })
  await expect(gauge.getByLabel('Mailles du patron')).toHaveValue('22')
  await gauge.getByLabel('Tes mailles').fill('24')
  await gauge.getByRole('button', { name: 'Enregistrer l’échantillon' }).click()
  await expect(gauge.getByRole('button', { name: 'Enregistrer l’échantillon' })).toBeDisabled()

  // Gardé au rechargement
  await page.reload()
  await expect(panel).toContainText('Phildar Partner 3.5')
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await page.getByRole('link', { name: /Dos – côtes/ }).click()
  await expect(page.getByText(/64 mailles à la fin \(≈ 70 avec ton échantillon\)/)).toBeVisible()

  // « tous les 5 cm » converti avec l'échantillon du patron (30 rangs pour 10 cm) : calcul expliqué, à valider
  await page.getByRole('button', { name: 'Étape suivante', exact: true }).click()
  const sections = page.getByRole('region', { name: 'Sous-étapes' })
  const check = sections.getByRole('note')
  await expect(check).toContainText('Converti depuis le patron : 5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ 15 rangs (arrondi).')
  await expect(sections).toContainText('1 diminution de chaque côté — tous les 15 rangs (≈ 5 cm) (4 fois)')
  await expectNoA11yViolations(page)
  await check.getByRole('button', { name: 'Valider' }).click()
  // Vérifié pour le projet : la conversion suit toujours l'échantillon, sans rien redemander ; l'étape est prête
  await expect(sections).toContainText('Vérifié pour ce projet.')
  await expect(check).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tricoter cette étape' })).toBeVisible()
  await expect(page.getByText('À préparer avant de tricoter')).toHaveCount(0)
  // Étape tricotée 2 fois : le nombre de fois se change en touchant l'avancée
  await page.getByRole('button', { name: 'Nombre de fois : à tricoter 1 fois' }).click()
  await page.getByLabel('À tricoter', { exact: true }).selectOption('2 fois')
  await expect(page.getByRole('button', { name: 'Nombre de fois : 1re fois sur 2' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expectNoA11yViolations(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Nombre de fois : 1re fois sur 2' })).toBeVisible()
  await expect(sections).toContainText('Vérifié pour ce projet.')

  // Le patron reste dans la bibliothèque, commencé : il n'est plus « à faire »
  await page.getByRole('link', { name: 'Gilet Rosée' }).click()
  await page.getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('link', { name: /Bibliothèque de patrons/ })).toContainText('1 patron')
  await page.getByRole('link', { name: /Bibliothèque de patrons/ }).click()
  await expect(page.getByRole('list', { name: 'Patrons' })).toContainText('1 projet')
  await page.getByRole('radio', { name: 'À faire' }).click()
  await expect(page.getByText('Aucun patron ne correspond.')).toBeVisible()
  await page.getByRole('radio', { name: 'Commencés' }).click()
  await page.getByRole('link', { name: /Gilet Rosée/ }).click()
  await expect(page.getByRole('list', { name: 'Projets de ce patron' })).toContainText('Gilet Rosée')
})

test('stock de laine : quel patron pour ma laine (la bibliothèque d’abord, puis des idées)', async ({ page }) => {
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.ideas).toMatchObject({ meters: 840, needle_mm: 4 })
    await route.fulfill({
      json: {
        weight: 'worsted',
        ideas: [
          {
            title: 'Snood torsadé',
            why: 'Mérinos doux.',
            meters: 300,
            needleMm: 4.5,
            search: 'cabled cowl',
            patterns: [{ title: 'Cabled Cowl', url: 'https://www.ravelry.com/patterns/library/cabled-cowl' }],
          },
        ],
      },
    })
  })
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const files = { pdfPath: null, newPdf: null, photos: [], newPhotos: [] }
  await api.knitting.savePattern({ title: 'Gilet Rosée', url: 'https://patrons.exemple/gilet', size: 'M', yarnIdea: '', notes: '', metersNeeded: 600, needleMm: 4, wish: 1 }, files, null)
  await api.knitting.savePattern({ title: 'Pull Bergamote', url: 'https://patrons.exemple/pull', size: 'M', yarnIdea: '', notes: '', metersNeeded: 1200, needleMm: 4, wish: 2 }, files, null)
  await login(page)
  await openNavPage(page, 'Tricot')

  // Laine ajoutée au stock
  const stash = page.getByRole('region', { name: 'Stock de laine' })
  await stash.getByRole('button', { name: 'Ajouter au stock' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ajouter au stock' })
  await dialog.getByLabel('Marque').fill('DROPS')
  await dialog.getByLabel('Nom de la laine').fill('Merino')
  await dialog.getByLabel(/Métrage d’une pelote/).fill('105')
  await dialog.getByLabel(/Nombre de pelotes/).fill('8')
  await dialog.getByLabel(/Aiguilles/).fill('4')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(stash.getByRole('list', { name: 'Stock de laine' })).toContainText('DROPS Merino')

  // Mes patrons d'abord : le gilet convient, pas le pull (pas assez de laine)
  await stash.getByRole('button', { name: 'Quel patron pour DROPS Merino ?' }).click()
  const match = page.getByRole('dialog', { name: 'Quel patron pour cette laine ?' })
  await expect(match).toContainText('840 m en stock')
  const fits = match.getByRole('list', { name: 'Patrons qui conviennent' })
  await expect(fits).toContainText('Gilet Rosée')
  await expect(fits).not.toContainText('Pull Bergamote')
  await expectNoA11yViolations(page)

  // Puis des idées avec l'IA
  await match.getByRole('button', { name: 'Des idées avec l’IA' }).click()
  await expect(match.getByRole('list', { name: 'Idées de modèles' })).toContainText('Snood torsadé')
  await expect(match.getByRole('link', { name: 'Cabled Cowl · ravelry.com' })).toHaveAttribute('href', 'https://www.ravelry.com/patterns/library/cabled-cowl')
  await expect(match.getByRole('link', { name: 'Plus de patrons sur Ravelry' })).toHaveAttribute('href', 'https://www.ravelry.com/patterns/search#craft=knitting&weight=worsted&yardage=0%7C918&needles=3.5mm%7C3.75mm%7C4.0mm%7C4.5mm&query=cabled%20cowl')
})

test('suit un diagramme ajouté depuis une image, rang par rang', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  await api.knitting.createProject({ title: 'Pull Torsadé', size: 'M', pdf: null, steps: PATTERN.steps as never })
  await login(page)
  await openNavPage(page, 'Tricot')
  await page.getByRole('link', { name: /^Pull Torsadé/ }).click()
  // La carte de la liste nomme aussi l'étape en cours : on attend la page du projet
  await expect(page.getByRole('heading', { level: 1, name: 'Pull Torsadé' })).toBeVisible()
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await page.getByRole('link', { name: /Dos – côtes/ }).click()
  await expect(page.getByRole('heading', { name: 'Dos – côtes' })).toBeVisible()

  // Image du diagramme (PNG d'un pixel), calée sur 6 lignes
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.getByLabel('Image du diagramme').setInputFiles({ name: 'torsade.png', mimeType: 'image/png', buffer: png })
  const setup = page.getByRole('dialog', { name: 'Caler le diagramme' })
  await setup.getByLabel('Lignes de la grille').fill('6')
  await setup.getByLabel('Nom (facultatif)').fill('Torsade')
  await expectNoA11yViolations(page)
  await setup.getByRole('button', { name: 'Enregistrer' }).click()

  // Image enregistrée (bucket privé) et bande sur le rang à tricoter
  const chart = page.getByRole('region', { name: 'Torsade' })
  await expect(chart.getByRole('status')).toHaveText('Rang 1 sur 6Endroit, de droite à gauche')
  await expect(chart.getByRole('img', { name: 'Torsade du patron' })).toHaveJSProperty('complete', true)
  expect(await chart.getByRole('img', { name: 'Torsade du patron' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  // Mode tricoter : le rang du diagramme est dans la ligne du rang, avec une bande de l'image
  await page.getByRole('link', { name: 'Tricoter cette étape' }).click()
  const row = page.getByRole('region', { name: /à tricoter$/ })
  await expect(row).toContainText('Torsade : rang 1 sur 6 · Endroit, de droite à gauche')
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(row).toContainText('Torsade : rang 2 sur 6 · Envers, de gauche à droite')

  // Plein écran depuis la bande : le compteur avance aussi
  await row.getByRole('button', { name: 'Voir Torsade en grand' }).click()
  const full = page.getByRole('dialog', { name: 'Torsade' })
  await full.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(full.getByRole('status')).toContainText('Rang 3 sur 6')
  await expectNoA11yViolations(page)
  await full.getByRole('button', { name: 'Fermer le plein écran' }).click()

  // Avancée et diagramme retrouvés après rechargement
  await page.reload()
  await expect(row).toContainText('Torsade : rang 3 sur 6')

  // Suppression du diagramme (préparation de l'étape)
  await page.getByRole('link', { name: 'Quitter le mode tricoter' }).click()
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await page.getByRole('link', { name: /Dos – côtes/ }).click()
  await expect(page.getByRole('region', { name: 'Torsade' }).getByRole('status')).toContainText('Rang 3 sur 6')
  await page.getByRole('button', { name: 'Supprimer Torsade' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Torsade' })).toHaveCount(0)
})

test('aides pendant le tricot : abréviations, pesée de la laine et rangs comptés hors ligne', async ({ page, context }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const steps = [
    { title: 'Dos', instructions: 'Comme le devant.', totalRows: 100, stitches: null, sections: [] },
    { title: 'Devant', instructions: 'Tricoter 1 jeté, puis C4F.', totalRows: 100, stitches: null, sections: [] },
  ]
  const id = await api.knitting.createProject({ title: 'Pull Aides', size: 'M', pdf: null, steps, abbreviations: [{ abbr: 'C4F', meaning: 'Torsade de 4 mailles devant.' }] })
  const project = (await api.knitting.getProject(id))!
  await api.knitting.saveProjectInfo(id, {
    yarns: [{ brand: 'DROPS', name: 'Merino', color: null, dye_lot: null, composition: null, weight_g: 50, length_m: 100, skeins: 10, needle_mm: 4 }],
    patternGauge: { stitches: null, rows: null },
    myGauge: { stitches: null, rows: null },
  })
  await api.knitting.saveProgress(project.steps[0]!.id, { rowCount: 100, done: true })
  await login(page)
  // L'étape en cours s'ouvre depuis la page du projet
  await page.goto(`/tricot/${id}`)
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await page.getByRole('link', { name: /Devant/ }).click()
  await expect(page.getByRole('heading', { name: 'Devant' })).toBeVisible()

  // Abréviations expliquées d'un toucher (le dos est fini : on est sur le devant) : celles du glossaire en base
  // (« jeté »), puis celles du patron (« C4F »). Le glossaire arrive après le texte : on l'attend avant de toucher.
  await page.getByRole('button', { name: 'jeté : explication' }).click()
  await expect(page.getByRole('dialog').getByText(/Passer le fil sur l’aiguille droite/)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'C4F : explication' }).click()
  await expect(page.getByRole('dialog').getByText('Torsade de 4 mailles devant.')).toBeVisible()
  await page.keyboard.press('Escape')

  // Pesée (page du projet) : 220 g restants pour la moitié du travail faite → il manque 2 pelotes
  await page.getByRole('link', { name: /^Pull Aides/ }).click()
  await page.getByRole('tab', { name: /3. Tricoter/ }).click()
  await page.getByRole('button', { name: 'Assez de laine pour finir ?' }).click()
  const card = page.getByRole('region', { name: 'Assez de laine pour finir ?' })
  await card.getByLabel('Laine restante (g)').fill('220')
  await card.getByRole('button', { name: 'Estimer' }).click()
  await expect(card.getByRole('status')).toContainText('Il manque ≈ 120 m, soit 2 pelotes.')
  await expectNoA11yViolations(page)

  // Hors ligne (mode tricoter) : les rangs comptés restent, et partent au retour du réseau
  await page.getByRole('link', { name: 'Tricoter', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Devant' })).toBeVisible()
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(page.getByText(/Hors ligne : tu tricotes sur la version gardée/)).toBeVisible()
  await context.setOffline(false)
  await expect.poll(async () => (await api.knitting.getProject(id))!.steps[1]!.rowCount).toBe(2)
  await expect(page.getByText(/Hors ligne/)).toHaveCount(0)
})

test('organise les étapes : regroupe, sépare et déplace une sous-étape, puis tricote l’étape regroupée', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const r = (rows: number, text: string) => ({ kind: 'rows' as const, rows, every: null, times: null, text, pattern: null })
  const id = await api.knitting.createProject({
    title: 'Pull Organisé',
    size: 'M',
    pdf: null,
    steps: [
      { title: 'Dos – côtes', instructions: 'Monter 90 m.', totalRows: 4, stitches: 90, sections: [r(4, 'côtes')] },
      { title: 'Dos – jersey', instructions: 'Jersey.', totalRows: 6, stitches: 90, sections: [r(4, 'jersey'), r(2, 'point mousse')] },
      { title: 'Manche', instructions: '', totalRows: 3, stitches: null, sections: [r(3, 'côtes')] },
    ],
  })
  await login(page)
  await page.goto(`/tricot/${id}`)
  // Organiser : une vue de l'onglet « Préparer »
  await page.getByRole('tab', { name: /2. Préparer/ }).click()
  await page.getByRole('tab', { name: 'Organiser' }).click()
  await expect(page.getByRole('button', { name: /^Regrouper avec/ }).first()).toBeVisible()
  await expectNoA11yViolations(page)

  // Regrouper « Dos – côtes » et « Dos – jersey »
  await page.getByRole('button', { name: 'Regrouper avec « Dos – jersey »' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Regrouper' }).click()
  const steps = page.getByRole('list', { name: 'Étapes' })
  await expect(steps.getByRole('heading')).toHaveText(['Dos – côtes', 'Manche'])
  await expect(page.getByRole('list', { name: 'Sous-étapes de « Dos – côtes »' }).getByRole('listitem')).toHaveText([/^4 rangs : côtes/, /^4 rangs : jersey/, /^2 rangs : point mousse/])
  // Le texte de chaque étape regroupée est porté par sa première sous-étape
  await expect(page.getByRole('list', { name: 'Sous-étapes de « Dos – côtes »' }).getByRole('listitem')).toHaveText(['4 rangs : côtesMonter 90 m.', '4 rangs : jerseyJersey.', '2 rangs : point mousse'])

  // Déplacer « point mousse » vers la manche, puis séparer la manche avant lui
  await page.getByRole('button', { name: 'Actions pour « 2 rangs : point mousse »' }).click()
  await page.getByRole('menuitem', { name: 'Déplacer vers une autre étape' }).click()
  const move = page.getByRole('alertdialog')
  await move.getByLabel('Étape').selectOption({ label: '2. Manche' })
  await move.getByRole('button', { name: 'Déplacer' }).click()
  await expect(page.getByRole('list', { name: 'Sous-étapes de « Manche »' }).getByRole('listitem')).toHaveText([/^3 rangs : côtes/, /^2 rangs : point mousse/])
  await page.getByRole('button', { name: 'Actions pour « 2 rangs : point mousse »' }).click()
  await page.getByRole('menuitem', { name: 'Nouvelle étape à partir d’ici' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Séparer' }).click()
  await expect(steps.getByRole('heading')).toHaveText(['Dos – côtes', 'Manche', 'Manche (suite)'])
  await expect(page.getByText(/^Étape 1 sur 3 · 8 rangs/)).toBeVisible()
  await expect(page.getByText('Étape 3 sur 3 · 2 rangs')).toBeVisible()

  // L'étape regroupée se tricote d'un bout à l'autre : le compteur de sous-étape suit
  await page.goto(`/tricot/${id}/tricoter`)
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  // 5 rangs faits : 4 de côtes, puis le 1er du jersey
  const counter = page.getByRole('contentinfo')
  await expect(counter).toContainText('1 / 4rangs faits · 4 rangs : jersey')
  await expect(counter).toContainText('Étape : 5 / 8 rangs')
})

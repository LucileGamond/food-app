import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, openNavPage, test } from './fixtures'

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
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

  await page.getByRole('link', { name: 'Nouveau patron' }).first().click()
  await page.getByLabel('Patron (PDF)').setInputFiles({ name: 'bergamote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fin') })
  await page.getByLabel('Taille choisie').fill('M')
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  await expect(page.getByRole('list', { name: 'Étapes lues' }).locator(':scope > li')).toHaveCount(2)
  expect(sent.size).toBe('M')
  expect(sent.pdf).toBe(Buffer.from('%PDF-1.4\n%fin').toString('base64'))
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()

  // Projet : première étape, puis la suivante
  await expect(page.getByRole('heading', { name: 'Dos – côtes' })).toBeVisible()
  await page.getByRole('button', { name: 'Étape terminée' }).click()
  await expect(page.getByRole('heading', { name: 'Emmanchures' })).toBeVisible()
  // « tous les 5 cm » réglé à 6 rangs
  await expect(page.getByText('1 diminution de chaque côté — tous les 5 cm (rangs à régler)')).toBeVisible()
  await page.getByRole('button', { name: /^Actions pour « 1 diminution/ }).click()
  await page.getByRole('menuitem', { name: 'Régler' }).click()
  await page.getByLabel('Tous les … rangs').fill('6')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Rangs 1 à 24 · prochaine fois : rang 6')).toBeVisible()
  // Section sans répétition ajoutée à la suite
  await page.getByRole('button', { name: 'Ajouter une section' }).click()
  await page.getByLabel('Nombre de rangs').fill('10')
  await page.getByLabel('Description (facultatif)').fill('côtes')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.getByText('Rangs 25 à 34')).toBeVisible()
  // 5 rangs terminés : le 6e est à tricoter, avec la diminution
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(page.getByRole('status')).toHaveText('Rang 6 à tricoter1 diminution de chaque côté (1/4)')
  await page.getByLabel('Notes', { exact: true }).fill('Aiguilles 4,5')
  await page.getByLabel('Notes', { exact: true }).blur()
  await expectNoA11yViolations(page)

  // Avancée enregistrée
  await expect.poll(async () => {
    await page.reload()
    return page.getByLabel('Notes', { exact: true }).inputValue()
  }).toBe('Aiguilles 4,5')
  await expect(page.getByRole('heading', { name: 'Emmanchures' })).toBeVisible()
  await expect(page.getByText('Rangs 1 à 24 · prochaine fois : rang 6')).toBeVisible()
  await expect(page.getByText('Taille M · 1 / 2 étapes')).toBeVisible()

  // Liste des projets, puis suppression
  await page.getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByRole('link', { name: /Pull Bergamote/ })).toContainText('Taille M · 1 / 2 étapes')
  await page.getByRole('link', { name: /Pull Bergamote/ }).click()
  await page.getByRole('button', { name: 'Actions sur le projet' }).click()
  await page.getByRole('menuitem', { name: 'Supprimer le projet' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page.getByText('Aucun projet')).toBeVisible()
})

test('met un patron de côté, le commence, puis note la laine (étiquette) et son échantillon', async ({ page }) => {
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

  // Patron mis de côté, depuis « Nouveau patron »
  await page.getByRole('link', { name: 'Nouveau patron' }).first().click()
  await page.getByRole('radio', { name: 'Mettre de côté' }).click()
  await page.getByLabel('Patron (PDF)').setInputFiles({ name: 'Gilet Rosée.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%gilet') })
  await page.getByLabel('Taille visée').fill('M')
  await page.getByLabel('Quand').selectOption('Bientôt')
  await expectNoA11yViolations(page)
  await page.getByRole('button', { name: 'Mettre de côté' }).click()
  // Liste repliée : ouverte d'un toucher
  await page.getByRole('button', { name: 'À faire plus tard' }).click()
  const queue = page.getByRole('list', { name: 'Patrons à faire plus tard' })
  await expect(queue).toContainText('Gilet Rosée')
  await expect(queue).toContainText('Bientôt · taille M')

  // Commencé : PDF et taille repris, le patron quitte la liste
  await queue.getByRole('link', { name: 'Commencer Gilet Rosée' }).click()
  await expect(page.getByRole('heading', { name: 'Commencer « Gilet Rosée »' })).toBeVisible()
  await expect(page.getByLabel('Taille choisie')).toHaveValue('M')
  // PDF repris : il n'est pas redemandé
  await expect(page.getByText('Gilet Rosée.pdf')).toBeVisible()
  await expect(page.getByLabel('Patron (PDF)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  await expect(page.getByText(/échantillon 22 m\. × 30 rangs pour 10 cm/)).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()
  await expect(page.getByRole('heading', { name: 'Dos – côtes' })).toBeVisible()

  // Laine lue sur l'étiquette
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
  await expect(page.getByText(/64 mailles à la fin \(≈ 70 avec ton échantillon\)/)).toBeVisible()

  // Gardé au rechargement ; la liste d'attente est vide
  await page.reload()
  await expect(page.getByRole('region', { name: 'Laine et échantillon' })).toContainText('Phildar Partner 3.5')
  await page.getByRole('link', { name: 'Projets' }).click()
  await expect(page.getByText('Aucun patron en attente', { exact: false })).toBeVisible()
})

test('stock de laine : quel patron pour ma laine (mes patrons d’abord, puis des idées)', async ({ page }) => {
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
  await api.knitting.addToQueue({ title: 'Gilet Rosée', pdf: null, url: 'https://patrons.exemple/gilet', size: 'M', yarnIdea: '', notes: '', priority: 1, metersNeeded: 600, needleMm: 4 })
  await api.knitting.addToQueue({ title: 'Pull Bergamote', pdf: null, url: 'https://patrons.exemple/pull', size: 'M', yarnIdea: '', notes: '', priority: 2, metersNeeded: 1200, needleMm: 4 })
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
  await expect(match.getByRole('link', { name: 'Plus de patrons sur Ravelry' })).toHaveAttribute('href', 'https://www.ravelry.com/patterns/search#craft=knitting&weight=worsted&query=cabled%20cowl')
})

test('suit un diagramme ajouté depuis une image, rang par rang', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  await api.knitting.createProject({ title: 'Pull Torsadé', size: 'M', pdf: null, steps: PATTERN.steps as never })
  await login(page)
  await openNavPage(page, 'Tricot')
  await page.getByRole('link', { name: /Pull Torsadé/ }).click()
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
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(chart.getByRole('status')).toHaveText('Rang 2 sur 6Envers, de gauche à droite')

  // Plein écran : le compteur avance aussi
  await chart.getByRole('button', { name: 'Plein écran : Torsade' }).click()
  const full = page.getByRole('dialog', { name: 'Torsade' })
  await full.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(full.getByRole('status')).toContainText('Rang 3 sur 6')
  await expectNoA11yViolations(page)
  await full.getByRole('button', { name: 'Fermer le plein écran' }).click()

  // Avancée et diagramme retrouvés après rechargement
  await page.reload()
  await expect(page.getByRole('region', { name: 'Torsade' }).getByRole('status')).toContainText('Rang 3 sur 6')

  // Suppression du diagramme
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
  await page.goto(`/tricot/${id}`)
  await expect(page.getByRole('heading', { name: 'Devant' })).toBeVisible()

  // Abréviation du patron expliquée d'un toucher (le dos est fini : on est sur le devant)
  await page.getByRole('button', { name: 'C4F : explication' }).click()
  await expect(page.getByText('Torsade de 4 mailles devant.')).toBeVisible()
  await page.keyboard.press('Escape')

  // Pesée : 220 g restants pour la moitié du travail faite → il manque 2 pelotes
  const card = page.getByRole('region', { name: 'Assez de laine pour finir ?' })
  await card.getByLabel('Laine restante (g)').fill('220')
  await card.getByRole('button', { name: 'Estimer' }).click()
  await expect(card.getByRole('status')).toContainText('Il manque ≈ 120 m, soit 2 pelotes.')
  await expectNoA11yViolations(page)

  // Hors ligne : les rangs comptés restent, et partent au retour du réseau
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await page.getByRole('button', { name: 'Ajouter 1 rang' }).click()
  await expect(page.getByText(/Hors ligne : tu tricotes sur la version gardée/)).toBeVisible()
  await context.setOffline(false)
  await expect.poll(async () => (await api.knitting.getProject(id))!.steps[1]!.rowCount).toBe(2)
  await expect(page.getByText(/Hors ligne/)).toHaveCount(0)
})

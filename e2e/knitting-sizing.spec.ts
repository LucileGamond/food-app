import { axeFor } from './support/a11y'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, openNavPage, test } from './fixtures'

// Lecture par le modèle simulée : tableau des mesures du vêtement fini, rangs comptés pour la taille demandée.
const SIZES = ['S', 'M', 'L']
const pattern = (size: string) => ({
  title: 'Pull Bergamote',
  sizes: SIZES,
  sizeIndex: Math.max(SIZES.indexOf(size), 0),
  steps: [{ title: 'Dos', instructions: 'Monter 90 (100-110) m.', totalRows: 120, stitches: [90, 100, 110][Math.max(SIZES.indexOf(size), 0)], sections: [] }],
  sizeChart: { kind: 'finished', easeCm: null, rows: [{ label: 'Tour de poitrine', measure: 'chest', values: [92, 101, 110] }] },
})

test('choisit la taille d’un patron selon une fiche de mesures', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  for (const fiche of await api.knitting.listMeasures()) await api.knitting.deleteMeasures(fiche.id)
  const sizes: string[] = []
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    const size = route.request().postDataJSON().size as string
    sizes.push(size)
    await route.fulfill({ json: pattern(size) })
  })
  await login(page)
  await openNavPage(page, 'Tricot')

  // Fiche de Léa (cadeau)
  await page.getByRole('button', { name: 'Nouvelle fiche' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nouvelle fiche de mesures' })
  await dialog.getByLabel('Pour qui').fill('Léa')
  await dialog.getByLabel('Tour de poitrine (cm)').fill('92')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('list', { name: 'Fiches de mesures' })).toContainText('poitrine 92 cm')

  // Patron lu sans taille (la première), puis taille conseillée et relecture pour elle
  await page.getByRole('link', { name: 'Nouveau patron' }).first().click()
  await page.getByLabel('Patron (PDF)').setInputFiles({ name: 'bergamote.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fin') })
  await page.getByRole('button', { name: 'Lire le patron' }).click()
  const card = page.getByRole('region', { name: 'Quelle taille pour qui ?' })
  await expect(card.getByRole('status')).toContainText('Taille conseillée : M')
  await card.getByRole('button', { name: 'Ample' }).click()
  await expect(card.getByRole('status')).toContainText('Taille conseillée : L')
  expect((await (await axeFor(page)).exclude('[data-sonner-toaster]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([])
  await card.getByRole('button', { name: 'Relire pour la taille L' }).click()
  await expect(card.getByRole('button', { name: /Relire/ })).toHaveCount(0)
  expect(sizes).toEqual(['', 'L'])
  await expect(page.getByText('120 rangs · 110 mailles à la fin')).toBeVisible()

  await page.getByRole('button', { name: 'Enregistrer le projet' }).click()
  await expect(page.getByText('0 / 1 étapes', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Taille', { exact: true }).locator('option:checked')).toHaveText('L')
})

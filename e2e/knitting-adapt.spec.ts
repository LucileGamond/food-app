import { axeFor } from './support/a11y'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

test('patron adapté à moi : échantillon et retouches, avant / après, bascule vers l’origine', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const id = await api.knitting.createProject({
    title: 'Pull Bergamote',
    size: 'M',
    pdf: null,
    steps: [
      { title: 'Manches', instructions: '', totalRows: 120, stitches: 60, sections: [] },
      { title: 'Col', instructions: '', totalRows: 10, stitches: 90, sections: [] },
    ],
    gauge: { stitches: 22, rows: 30 },
  })
  await api.knitting.saveProjectInfo(id, { yarns: [], patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 30 } })

  // Réponse du modèle simulée : seule la manche change.
  await page.route('**/functions/v1/knit-pattern', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.adapt).toMatchObject({ request: '5 cm de plus aux manches', my_gauge: { stitches: 24, rows: 30 } })
    await route.fulfill({ json: { steps: [{ index: 0, totalRows: 136, stitches: 66, sections: [], note: '16 rangs de plus pour 5 cm.' }] } })
  })
  await login(page)
  await page.goto(`/tricot/${id}`)

  // Page du projet : la carte est repliée
  await page.getByRole('button', { name: 'Patron adapté à moi' }).click()
  const panel = page.getByRole('region', { name: /Patron adapté à moi/ })
  await panel.getByLabel('Retouches (facultatif)').fill('5 cm de plus aux manches')
  await panel.getByRole('button', { name: 'Adapter avec l’IA' }).click()
  const dialog = page.getByRole('dialog', { name: 'Patron adapté' })
  await expect(dialog.getByRole('list', { name: 'Étapes adaptées' })).toContainText('120 → 136 rangs · 60 → 66 mailles')
  expect((await (await axeFor(page)).analyze()).violations).toEqual([])
  await dialog.getByRole('button', { name: 'Suivre ce patron adapté' }).click()

  await expect(page.getByRole('link', { name: /Manches/ })).toContainText('0 / 136 rangs')
  await page.getByRole('link', { name: /Manches/ }).click()
  const article = page.getByRole('article')
  await expect(article).toContainText('Patron adapté : 16 rangs de plus pour 5 cm.')
  await expect(article).toContainText('/ 136')

  // Retour au patron d'origine
  await page.getByRole('link', { name: 'Pull Bergamote' }).click()
  await page.getByRole('button', { name: 'Patron adapté à moi' }).click()
  await panel.getByRole('checkbox', { name: 'Suivre le patron adapté' }).click()
  await expect(page.getByRole('link', { name: /Manches/ })).toContainText('0 / 120 rangs')
  await page.getByRole('link', { name: /Manches/ }).click()
  await expect(article).toContainText('/ 120')
  await expect(article).not.toContainText('Patron adapté :')
  // Le patron d'origine n'a pas changé
  expect((await api.knitting.getProject(id))!.steps[0]!.totalRows).toBe(120)
})

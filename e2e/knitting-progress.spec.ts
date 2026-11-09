import { axeFor } from './support/a11y'
import { DEFAULT_SETTINGS } from '../src/lib/settings'
import { signedInApi } from '../tests/integration/helpers'
import { expect, login, test } from './fixtures'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('notes et photos d’avancement d’un projet de tricot', async ({ page }) => {
  const { api } = await signedInApi()
  await api.settings.saveSettings({ ...DEFAULT_SETTINGS, disabledPages: [] })
  const id = await api.knitting.createProject({
    title: 'Pull Bergamote',
    size: 'M',
    pdf: null,
    steps: [
      { title: 'Dos – côtes', instructions: '', totalRows: 18, stitches: 64, sections: [] },
      { title: 'Emmanchures', instructions: '', totalRows: 30, stitches: 56, sections: [] },
    ],
  })
  await login(page)
  await page.goto(`/tricot/${id}`)

  // Page du projet : la carte est repliée
  const open = () => page.getByRole('button', { name: 'Notes et photos' }).click()
  await open()
  const panel = page.getByRole('region', { name: 'Notes et photos' })
  await panel.getByLabel('Notes du projet').fill('Manches raccourcies de 2 cm')
  await panel.getByLabel('Notes du projet').blur()

  // Photo prise pendant l'étape en cours
  await panel.getByLabel('Ajouter une photo d’avancement').setInputFiles({ name: 'dos.png', mimeType: 'image/png', buffer: PNG })
  const photos = panel.getByRole('list', { name: 'Photos d’avancement' })
  await expect(photos.getByRole('listitem')).toHaveCount(1)
  await expect(photos).toContainText('Dos – côtes')
  expect((await (await axeFor(page)).exclude('[data-sonner-toaster]').analyze()).violations).toEqual([])

  // Agrandie, légendée
  await photos.getByRole('button', { name: /^Voir la photo/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('img')).toBeVisible()
  await dialog.getByLabel('Légende').fill('Fin du dos')
  await dialog.getByLabel('Légende').blur()
  await page.keyboard.press('Escape')
  await expect(photos).toContainText('Fin du dos')

  // Gardé au rechargement, puis supprimée
  await expect.poll(async () => {
    await page.reload()
    return panel.getByLabel('Notes du projet').inputValue()
  }).toBe('Manches raccourcies de 2 cm')
  await open()
  await expect(photos).toContainText('Fin du dos')
  await photos.getByRole('button', { name: 'Voir la photo : Fin du dos' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la photo' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
  await expect(panel.getByText(/Aucune photo/)).toBeVisible()
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { KnitChart } from '../lib/chart'
import type { KnitProject, KnitStep } from '../lib/pattern'
import { KnittingProjectPage } from './KnittingProjectPage'

// Pas de canvas dans jsdom : l'image du diagramme est envoyée telle quelle.
vi.mock('@/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image')>()),
  editImage: vi.fn(async (file: Blob) => file),
}))

const pdf = vi.hoisted(() => ({
  renderPage: vi.fn(async (page: number) => new File(['jpg'], `page-${page}.jpg`, { type: 'image/jpeg' })),
  close: vi.fn(async () => undefined),
}))
const openPdf = vi.hoisted(() => vi.fn())
vi.mock('@/lib/pdf', () => ({ openPdf }))

beforeEach(() => {
  openPdf.mockReset()
  openPdf.mockResolvedValue({ pageCount: 2, ...pdf })
})

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos – côtes',
  instructions: '',
  totalRows: 40,
  stitches: null,
  sections: [],
  rowCount: 0,
  notes: '',
  done: false,
  ...overrides,
})

const TORSADE: KnitChart = {
  id: 'c1',
  stepId: 's2',
  title: 'Torsade',
  imagePath: 'u-lucile/c1.jpg',
  imageUrl: 'https://cdn.test/c1.jpg',
  gridTop: 0,
  gridBottom: 1,
  rows: 6,
  startRow: 1,
  repeats: true,
  flat: false,
  oddOnly: false,
}

const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  pdfPath: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
  steps: [step({ id: 's1', done: true, rowCount: 40 }), step({ id: 's2', position: 1, title: 'Devant torsadé', rowCount: 8 })],
  charts: [TORSADE],
  chartHints: [],
}

function renderProject(project: KnitProject = PROJECT, api = fakeApi()) {
  api.knitting.getProject.mockResolvedValue(structuredClone(project))
  return renderWithApp(<KnittingProjectPage />, { api, route: '/tricot/p1', path: '/tricot/:id' })
}

describe('diagrammes d’une étape', () => {
  it('surligne le rang à tricoter et le fait avancer avec le compteur', async () => {
    const user = userEvent.setup()
    renderProject()
    const chart = await screen.findByRole('region', { name: 'Torsade' })
    // 8 rangs faits : rang 9 de l'étape = rang 3 du diagramme de 6 rangs, 2e fois
    expect(within(chart).getByRole('status')).toHaveTextContent('Rang 3 sur 6 · 2e fois')
    expect(within(chart).getByRole('img', { name: 'Torsade du patron' })).toHaveAttribute('src', 'https://cdn.test/c1.jpg')
    // Rang 3 sur 6, de bas en haut : de 50 % à 66,7 % de la hauteur
    expect(parseFloat(within(chart).getByTestId('chart-band').style.top)).toBeCloseTo(50)

    await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(within(chart).getByRole('status')).toHaveTextContent('Rang 4 sur 6 · 2e fois')
    expect(parseFloat(within(chart).getByTestId('chart-band').style.top)).toBeCloseTo(33.33, 1)
  })

  it('annonce un diagramme qui commence plus loin, ou qui est fini', async () => {
    renderProject({ ...PROJECT, charts: [{ ...TORSADE, startRow: 12 }, { ...TORSADE, id: 'c2', title: 'Bordure', repeats: false }] })
    expect(within(await screen.findByRole('region', { name: 'Torsade' })).getByRole('status')).toHaveTextContent('Commence au rang 12 de l’étape')
    expect(within(screen.getByRole('region', { name: 'Bordure' })).getByRole('status')).toHaveTextContent('Diagramme terminé')
    expect(screen.queryByTestId('chart-band')).not.toBeInTheDocument()
  })

  it('n’affiche que les diagrammes de l’étape', async () => {
    renderProject({ ...PROJECT, charts: [{ ...TORSADE, stepId: 's1' }] })
    expect(await screen.findByRole('heading', { name: 'Devant torsadé' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Torsade' })).not.toBeInTheDocument()
  })

  it('ajoute un diagramme depuis une image, calé sur ses rangs', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject({ ...PROJECT, charts: [] }, api)
    const image = new File(['png'], 'grille.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Image du diagramme'), image)

    const dialog = await screen.findByRole('dialog', { name: 'Caler le diagramme' })
    expect(within(dialog).getByRole('img', { name: 'Diagramme à caler' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Étape')).toHaveValue('s2')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Lignes de la grille')

    await user.type(within(dialog).getByLabelText('Lignes de la grille'), '24')
    await user.type(within(dialog).getByLabelText('Nom (facultatif)'), 'Jacquard')
    await user.click(within(dialog).getByLabelText('Recommencer le diagramme après le dernier rang'))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.knitting.addChart).toHaveBeenCalledWith('p1', image, { stepId: 's2', title: 'Jacquard', gridTop: 0, gridBottom: 1, rows: 24, startRow: 1, repeats: false, flat: true, oddOnly: false }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.knitting.getProject).toHaveBeenCalledTimes(2)
  })

  it('refuse un fichier qui n’est pas une image', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const api = fakeApi()
    renderProject(PROJECT, api)
    await user.upload(await screen.findByLabelText('Image du diagramme'), new File(['%PDF'], 'patron.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('Choisis une image (capture d’écran ou photo).')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('règle et supprime un diagramme', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(PROJECT, api)
    await user.click(await screen.findByRole('button', { name: 'Régler Torsade' }))
    const dialog = await screen.findByRole('dialog', { name: 'Caler le diagramme' })
    expect(within(dialog).queryByRole('button', { name: 'Recadrer l’image' })).not.toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('Rang 1 du diagramme au rang de l’étape'))
    await user.type(within(dialog).getByLabelText('Rang 1 du diagramme au rang de l’étape'), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.updateChart).toHaveBeenCalledWith('c1', expect.objectContaining({ startRow: 3, rows: 6, stepId: 's2' })))

    await user.click(screen.getByRole('button', { name: 'Supprimer Torsade' }))
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deleteChart).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', imagePath: 'u-lucile/c1.jpg' })))
  })

  it('prend le diagramme sur une page du PDF du patron, recadrée', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject({ ...PROJECT, pdfPath: 'u-lucile/abc.pdf', charts: [] }, api)
    await user.click(await screen.findByRole('button', { name: 'Diagramme du PDF' }))
    expect(api.knitting.downloadPdf).toHaveBeenCalledWith('u-lucile/abc.pdf', 'patron')
    const pages = await screen.findByRole('list', { name: 'Pages du patron' })
    await waitFor(() => expect(pdf.renderPage).toHaveBeenCalledTimes(2))
    expect(pdf.renderPage).toHaveBeenCalledWith(1, 360)

    await user.click(within(pages).getByRole('button', { name: 'Page 2' }))
    expect(pdf.renderPage).toHaveBeenLastCalledWith(2, 2400)
    // Page entière : recadrage d'abord, puis calage
    const crop = await screen.findByRole('dialog', { name: 'Retoucher la photo' })
    await user.click(within(crop).getByRole('button', { name: 'Annuler' }))
    const dialog = await screen.findByRole('dialog', { name: 'Caler le diagramme' })
    expect(pdf.close).toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText('Lignes de la grille'), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.addChart).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'page-2.jpg' }), expect.objectContaining({ rows: 12 })))
  })

  it('prévient si le PDF ne s’ouvre pas', async () => {
    const user = userEvent.setup()
    openPdf.mockRejectedValue(new Error('PDF abîmé'))
    renderProject({ ...PROJECT, pdfPath: 'u-lucile/abc.pdf', charts: [] })
    await user.click(await screen.findByRole('button', { name: 'Diagramme du PDF' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Le PDF du patron n’a pas pu être ouvert.')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sans PDF, propose seulement une image', async () => {
    renderProject()
    expect(await screen.findByRole('button', { name: 'Ajouter un diagramme' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Diagramme du PDF' })).not.toBeInTheDocument()
  })

  it('donne le sens de lecture à plat, et les rangs envers non dessinés', async () => {
    const api = fakeApi()
    const flat = { ...TORSADE, flat: true }
    renderProject({ ...PROJECT, charts: [flat, { ...flat, id: 'c2', title: 'Jacquard', oddOnly: true }] }, api)
    // Rang 9 de l'étape : rang 3 du diagramme, impair, sur l'endroit
    const torsade = await screen.findByRole('region', { name: 'Torsade' })
    expect(within(torsade).getByRole('status')).toHaveTextContent('Rang 3 sur 6 · 2e foisEndroit, de droite à gauche')
    expect(within(torsade).getByTestId('chart-band')).toHaveAttribute('data-direction', 'rtl')
    // Une ligne pour deux rangs : rang 9 sur 12, ligne 5
    const jacquard = screen.getByRole('region', { name: 'Jacquard' })
    expect(within(jacquard).getByRole('status')).toHaveTextContent('Rang 9 sur 12Endroit, de droite à gauche')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(within(torsade).getByRole('status')).toHaveTextContent('Envers, de gauche à droite')
    expect(within(torsade).getByTestId('chart-band')).toHaveAttribute('data-direction', 'ltr')
    expect(within(jacquard).getByRole('status')).toHaveTextContent('Rang 10 sur 12Envers, non dessiné')
  })

  it('suit le diagramme en plein écran, avec le compteur et le zoom', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(PROJECT, api)
    await user.click(await screen.findByRole('button', { name: 'Plein écran : Torsade' }))
    const full = await screen.findByRole('dialog', { name: 'Torsade' })
    expect(within(full).getByRole('status')).toHaveTextContent('Rang 3 sur 6 · 2e fois · Tour de droite à gauche')
    expect(within(full).getByText('rangs faits')).toHaveTextContent('8 rangs faits')

    await user.click(within(full).getByRole('button', { name: 'Ajouter 1 rang' }))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { rowCount: 9 })
    expect(within(full).getByRole('status')).toHaveTextContent('Rang 4 sur 6')
    await user.click(within(full).getByRole('button', { name: 'Retirer un rang' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { rowCount: 8 })

    const image = () => within(full).getByRole('img', { name: 'Torsade du patron' }).parentElement!
    expect(within(full).getByRole('button', { name: 'Dézoomer' })).toBeDisabled()
    await user.click(within(full).getByRole('button', { name: 'Zoomer' }))
    expect(image().style.width).toBe('150%')
    await user.click(within(full).getByRole('button', { name: 'Zoomer' }))
    await user.click(within(full).getByRole('button', { name: 'Dézoomer' }))
    expect(image().style.width).toBe('150%')

    await user.click(within(full).getByRole('button', { name: 'Fermer le plein écran' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(screen.getByRole('region', { name: 'Torsade' })).getByTestId('chart-band')).toBeInTheDocument()
  })

  it('règle le tricot à plat et les rangs endroit seuls', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(PROJECT, api)
    await user.click(await screen.findByRole('button', { name: 'Régler Torsade' }))
    const dialog = await screen.findByRole('dialog', { name: 'Caler le diagramme' })
    const oddOnly = within(dialog).getByLabelText(/Seuls les rangs endroit/)
    expect(oddOnly).toBeDisabled()
    await user.click(within(dialog).getByLabelText(/Tricot à plat/))
    await user.click(oddOnly)
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.updateChart).toHaveBeenCalledWith('c1', expect.objectContaining({ flat: true, oddOnly: true })))
  })

  it('signale les pages repérées à la lecture et pré-remplit le calage', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const hint = { page: 2, title: 'Jacquard', rows: 12, step: 1, flat: true, oddOnly: true }
    renderProject({ ...PROJECT, pdfPath: 'u-lucile/abc.pdf', charts: [], chartHints: [hint] }, api)
    await user.click(await screen.findByRole('button', { name: 'Diagramme du PDF' }))
    const pages = await screen.findByRole('list', { name: 'Pages du patron' })
    expect(within(pages).getByRole('button', { name: /Page 2/ })).toHaveTextContent('Page 2Jacquard')
    expect(within(pages).getByRole('button', { name: 'Page 1' })).toBeInTheDocument()

    await user.click(within(pages).getByRole('button', { name: /Page 2/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Retoucher la photo' })).getByRole('button', { name: 'Annuler' }))
    const dialog = await screen.findByRole('dialog', { name: 'Caler le diagramme' })
    expect(within(dialog).getByLabelText('Lignes de la grille')).toHaveValue('12')
    expect(within(dialog).getByLabelText('Nom (facultatif)')).toHaveValue('Jacquard')
    expect(within(dialog).getByLabelText(/Seuls les rangs endroit/)).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.knitting.addChart).toHaveBeenCalledWith('p1', expect.anything(), expect.objectContaining({ stepId: 's2', title: 'Jacquard', rows: 12, oddOnly: true })),
    )
  })
})

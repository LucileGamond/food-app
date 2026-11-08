import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { describePhoto, formatPhotoDate, type ProgressPhoto } from '../lib/progress'
import type { KnitProject, KnitStep } from '../lib/pattern'
import { KnittingProjectPage } from './KnittingProjectPage'

// Réduction des photos : sans canvas dans jsdom, la photo passe telle quelle (en JPEG).
vi.mock('@/lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/image')>()),
  compressImage: vi.fn(async (file: File) => new Blob([file], { type: 'image/jpeg' })),
}))

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos – côtes',
  instructions: '',
  totalRows: 18,
  stitches: 64,
  sections: [],
  rowCount: 0,
  notes: '',
  done: false,
  highlights: {},
  ...overrides,
})

/** Projet minimal (deux étapes, la première terminée). */
function project(): KnitProject {
  return {
    charts: [],
    chartHints: [],
    sizes: [],
    sizeIndex: null,
    id: 'p1',
    title: 'Pull Bergamote',
    size: 'M',
    pdfPath: null,
    steps: [step({ id: 's1', done: true }), step({ id: 's2', position: 1, title: 'Emmanchures' })],
    yarns: [],
    patternGauge: { stitches: null, rows: null },
    myGauge: { stitches: null, rows: null },
  }
}

const PHOTO: ProgressPhoto = { id: 'ph1', storagePath: 'u-lucile/ph1.jpg', caption: '', stepId: 's1', takenAt: '2026-11-08T10:00:00Z' }

function renderProject(api = fakeApi()) {
  api.knitting.getProject.mockResolvedValue(project())
  return renderWithApp(<KnittingProjectPage />, { route: '/tricot/p1', path: '/tricot/:id', api })
}

describe('notes et photos d’avancement', () => {
  it('décrit une photo : étape et date', () => {
    expect(formatPhotoDate('2026-11-08T10:00:00Z')).toBe('8 nov. 2026')
    expect(describePhoto(PHOTO, (id) => (id === 's1' ? 'Dos – côtes' : undefined))).toBe('Dos – côtes · 8 nov. 2026')
    expect(describePhoto({ ...PHOTO, stepId: null }, () => 'x')).toBe('8 nov. 2026')
  })

  it('enregistre les notes du projet en quittant le champ', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getProgress.mockResolvedValue({ notes: 'Manches raccourcies', photos: [] })
    renderProject(api)
    const notes = await screen.findByLabelText('Notes du projet')
    await waitFor(() => expect(notes).toHaveValue('Manches raccourcies'))
    expect(screen.getByText(/Aucune photo/)).toBeInTheDocument()
    await user.clear(notes)
    await user.type(notes, 'Manches raccourcies de 2 cm')
    await user.tab()
    await waitFor(() => expect(api.knitting.saveProjectNotes).toHaveBeenCalledWith('p1', 'Manches raccourcies de 2 cm'))
    // Sans changement : rien n'est enregistré.
    await user.click(notes)
    await user.tab()
    expect(api.knitting.saveProjectNotes).toHaveBeenCalledTimes(1)
  })

  it('ajoute une photo rattachée à l’étape en cours', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(api)
    const photo = new File(['img'], 'pull.jpg', { type: 'image/jpeg' })
    await screen.findByText(/Aucune photo/)
    api.knitting.getProgress.mockResolvedValue({ notes: '', photos: [{ ...PHOTO, stepId: 's2' }] })
    await user.upload(screen.getByLabelText('Ajouter une photo d’avancement'), photo)
    // Étape en cours : la première non terminée (Emmanchures).
    expect(api.knitting.addProgressPhoto).toHaveBeenCalledWith('p1', expect.any(Blob), { stepId: 's2', caption: '' })
    const list = await screen.findByRole('list', { name: 'Photos d’avancement' })
    expect(within(list).getByText('Emmanchures · 8 nov. 2026')).toBeInTheDocument()
  })

  it('agrandit une photo, la légende puis la supprime', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getProgress.mockResolvedValue({ notes: '', photos: [PHOTO] })
    renderProject(api)
    await user.click(await screen.findByRole('button', { name: 'Voir la photo : Dos – côtes · 8 nov. 2026' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://cdn.test/u-lucile/ph1.jpg')
    await user.type(within(dialog).getByLabelText('Légende'), 'Fin du dos')
    await user.tab()
    await waitFor(() => expect(api.knitting.saveCaption).toHaveBeenCalledWith('ph1', 'Fin du dos'))
    // Derrière la fenêtre ouverte, la vignette porte la légende.
    expect(screen.getByRole('button', { name: 'Voir la photo : Fin du dos', hidden: true })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Supprimer la photo' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.deleteProgressPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'ph1' })))
  })

  it('signale les erreurs (chargement, envoi)', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.getProgress.mockRejectedValueOnce(new AppError('Impossible de charger les notes et photos.'))
    api.knitting.addProgressPhoto.mockRejectedValue(new AppError('Impossible d’envoyer la photo.'))
    renderProject(api)
    expect(await screen.findByText('Impossible de charger les notes et photos.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    await screen.findByText(/Aucune photo/)
    await user.upload(screen.getByLabelText('Ajouter une photo d’avancement'), new File(['img'], 'pull.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('Impossible d’envoyer la photo.')).toBeInTheDocument()
  })
})

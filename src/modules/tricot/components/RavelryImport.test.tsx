import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { importSourceText, pdfMissingText, ravelryImportFields, type KnitPattern, type RavelryImported, type RavelryImportItem } from '../lib/library'
import { RavelryImport } from './RavelryImport'

vi.mock('@/lib/image', async (original) => ({ ...(await original<typeof import('@/lib/image')>()), compressImage: vi.fn(async (f: Blob) => f) }))

const LOULOU: RavelryImportItem = { patternId: 1, title: 'Loulou Lace Shawl', author: 'Gabrielle Vézina', photoUrl: 'https://img.exemple/loulou.jpg', sources: ['favori'], volumeId: null, hasPdf: false }
const FERN: RavelryImportItem = { patternId: 3, title: 'Fern Field Scarf', author: 'Lisa Hannes', photoUrl: null, sources: ['bibliothèque'], volumeId: 100, hasPdf: true }
const CINDER: RavelryImportItem = { patternId: 2, title: 'Cinder', author: 'Jared Flood', photoUrl: null, sources: ['favori', 'bibliothèque'], volumeId: 101, hasPdf: true }

const INFO = { title: 'Fern Field Scarf', sizes: [], meters: [346], needleMm: 4.5, yarn: 'Cardiff Cashmere', kind: null }
const pdf = new File(['%PDF'], 'Fern_EN.pdf', { type: 'application/pdf' })
const photo = new File(['img'], 'photo-du-modele.jpg', { type: 'image/jpeg' })

function imported(item: RavelryImportItem, extra: Partial<RavelryImported> = {}): RavelryImported {
  return { url: `https://www.ravelry.com/patterns/library/p${item.patternId}`, title: item.title, author: item.author, info: INFO, image: null, pdf: null, pdfMissing: null, ...extra }
}

const existing = { id: 'x', title: 'Cinder', url: null } as KnitPattern

function setup({ linked = true, library = [] as KnitPattern[] } = {}) {
  const api = fakeApi()
  if (linked) api.knitting.getRavelryAccount.mockResolvedValue({ username: 'Youcite' })
  api.knitting.listRavelryImports.mockResolvedValue([LOULOU, FERN, CINDER])
  const onDone = vi.fn()
  renderWithApp(<RavelryImport library={library} onDone={onDone} />, { api })
  return { api, onDone, user: userEvent.setup() }
}

describe('import depuis Ravelry : fiche du patron', () => {
  it('métrage seulement s’il ne dépend pas de la taille ; tailles, métrage et créatrice en notes', () => {
    expect(ravelryImportFields(imported(FERN))).toEqual({
      title: 'Fern Field Scarf',
      url: 'https://www.ravelry.com/patterns/library/p3',
      size: null,
      yarnIdea: 'Cardiff Cashmere',
      notes: 'Par Lisa Hannes.',
      metersNeeded: 346,
      needleMm: 4.5,
      tags: [],
    })
    const sized = ravelryImportFields(imported(FERN, { author: null, info: { ...INFO, sizes: ['S', 'M', 'L'], meters: [400, null, 600], yarn: null } }))
    expect(sized).toMatchObject({ metersNeeded: null, yarnIdea: '', notes: 'Tailles : S, M, L. Métrage : 400 à 600 m selon la taille.' })
    // Même métrage pour toutes les tailles connues : gardé
    expect(ravelryImportFields(imported(FERN, { info: { ...INFO, sizes: ['A', 'B'], meters: [346, 346] } })).metersNeeded).toBe(346)
  })

  it('d’où vient le patron ; ce qu’on dit d’un PDF manquant', () => {
    expect(importSourceText(LOULOU)).toBe('favori')
    expect(importSourceText(CINDER)).toBe('favori · bibliothèque (PDF)')
    expect(importSourceText({ sources: ['bibliothèque'], hasPdf: false })).toBe('bibliothèque')
    expect(pdfMissingText('permission', true)).toBe('sans le PDF : permission Ravelry à accorder')
    expect(pdfMissingText('erreur', true)).toBe('sans le PDF : téléchargement raté')
    expect(pdfMissingText('aucun', true)).toBeNull()
    expect(pdfMissingText(null, true)).toBeNull()
    // Favori seul : il n'y a jamais eu de PDF à récupérer
    expect(pdfMissingText('permission', false)).toBeNull()
  })
})

describe('import depuis Ravelry : fenêtre', () => {
  it('compte non relié : pas de bouton', async () => {
    const { api } = setup({ linked: false })
    await waitFor(() => expect(api.knitting.getRavelryAccount).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Depuis Ravelry' })).not.toBeInTheDocument()
  })

  it('liste favoris et bibliothèque ; déjà dans la bibliothèque : décoché et bloqué', async () => {
    const { user } = setup({ library: [existing] })
    await user.click(await screen.findByRole('button', { name: 'Depuis Ravelry' }))
    const list = await screen.findByRole('list', { name: 'Patrons Ravelry' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(list).toHaveTextContent('Gabrielle Vézina · favori')
    expect(list).toHaveTextContent('Jared Flood · favori · bibliothèque (PDF) · déjà dans ta bibliothèque')
    expect(within(list).getByRole('checkbox', { name: /Cinder/ })).not.toBeChecked()
    expect(within(list).getByRole('checkbox', { name: /Cinder/ })).toHaveAttribute('aria-disabled', 'true')
    expect(within(list).getByRole('checkbox', { name: /Loulou/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Importer (2)' })).toBeEnabled()
  })

  it('importe les patrons cochés un à un : fiche, photo réduite et PDF ; puis recharge la bibliothèque', async () => {
    const { api, onDone, user } = setup()
    api.knitting.importRavelryPattern.mockImplementation(async (item) =>
      item.patternId === 3 ? imported(FERN, { image: photo, pdf }) : item.patternId === 2 ? imported(CINDER, { pdfMissing: 'permission' }) : imported(LOULOU),
    )
    await user.click(await screen.findByRole('button', { name: 'Depuis Ravelry' }))
    const list = await screen.findByRole('list', { name: 'Patrons Ravelry' })
    // Loulou décoché : pas importé
    await user.click(within(list).getByRole('checkbox', { name: /Loulou/ }))
    await user.click(screen.getByRole('button', { name: 'Importer (2)' }))

    expect(await screen.findByText('2 patrons ajoutés à la bibliothèque.')).toBeInTheDocument()
    expect(api.knitting.importRavelryPattern).toHaveBeenCalledTimes(2)
    expect(api.knitting.importRavelryPattern).toHaveBeenCalledWith(FERN)
    expect(api.knitting.savePattern).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fern Field Scarf', metersNeeded: 346, needleMm: 4.5, notes: 'Par Lisa Hannes.' }), { pdfPath: null, newPdf: pdf, photos: [photo] }, null)
    expect(api.knitting.savePattern).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cinder' }), { pdfPath: null, newPdf: null, photos: [] }, null)
    expect(list).toHaveTextContent('ajouté sans le PDF : permission Ravelry à accorder')
    expect(screen.getByText(/il faut accorder à l’application la permission/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onDone).toHaveBeenCalled()
  })

  it('erreur sur un patron : les autres continuent, message lisible', async () => {
    const { api, user } = setup()
    api.knitting.importRavelryPattern.mockImplementation(async (item) => {
      if (item.patternId === 1) throw new AppError('Impossible d’importer ce patron de Ravelry.')
      return imported(FERN)
    })
    await user.click(await screen.findByRole('button', { name: 'Depuis Ravelry' }))
    await user.click(await screen.findByRole('button', { name: 'Importer (3)' }))
    expect(await screen.findByText('2 patrons ajoutés à la bibliothèque.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Patrons Ravelry' })).toHaveTextContent('Impossible d’importer ce patron de Ravelry.')
    expect(api.knitting.savePattern).toHaveBeenCalledTimes(2)
  })

  it('liste illisible ou vide ; fermer sans rien importer ne recharge pas', async () => {
    const { api, onDone, user } = setup()
    api.knitting.listRavelryImports.mockRejectedValueOnce(new AppError('Impossible de lire tes patrons Ravelry.')).mockResolvedValueOnce([])
    await user.click(await screen.findByRole('button', { name: 'Depuis Ravelry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de lire tes patrons Ravelry.')
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    await user.click(screen.getByRole('button', { name: 'Depuis Ravelry' }))
    expect(await screen.findByText('Aucun patron en favori ni dans ta bibliothèque Ravelry.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('pendant la lecture puis l’import : message d’attente, boutons bloqués', async () => {
    const { api, user } = setup()
    let finish!: () => void
    api.knitting.importRavelryPattern.mockImplementation(() => new Promise<RavelryImported>((resolve) => (finish = () => resolve(imported(LOULOU)))))
    let listed!: () => void
    api.knitting.listRavelryImports.mockImplementation(() => new Promise<RavelryImportItem[]>((resolve) => (listed = () => resolve([LOULOU, FERN, CINDER]))))
    await user.click(await screen.findByRole('button', { name: 'Depuis Ravelry' }))
    expect(screen.getByRole('status')).toHaveTextContent('Lecture de tes patrons Ravelry…')
    listed()
    await user.click(await screen.findByRole('button', { name: 'Importer (3)' }))
    expect(screen.getByRole('button', { name: 'Import en cours…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()
    expect(screen.getByRole('list', { name: 'Patrons Ravelry' })).toHaveTextContent('import…')
    finish()
    await waitFor(() => expect(api.knitting.importRavelryPattern).toHaveBeenCalledTimes(2))
    finish()
    await waitFor(() => expect(api.knitting.importRavelryPattern).toHaveBeenCalledTimes(3))
    finish()
    expect(await screen.findByText('3 patrons ajoutés à la bibliothèque.')).toBeInTheDocument()
  })
})

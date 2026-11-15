import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { stashItem } from '@/test/knitFactories'
import { openFold } from '@/test/openFold'
import type { KnitProject } from '../lib/pattern'
import { EMPTY_YARN } from '../lib/yarn'
import { KnittingProjectPage } from './KnittingProjectPage'
import { PROJECT, START, renderProject } from './knittingTestUtils'

// Le projet est gardé sur le téléphone (hors ligne) : chaque test repart sans copie.
beforeEach(() => localStorage.clear())

describe('Démarrer : aiguilles du patron et mes échantillons', () => {
  it('aiguilles du patron : indiquées dans « Démarrer »', async () => {
    const user = userEvent.setup()
    const { api } = renderProject(fakeApi(), PROJECT, START)
    await openFold('Taille et aiguilles')
    expect(await screen.findByText('aucune : indique-les pour que chaque sous-étape choisisse la sienne')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Modifier les aiguilles du patron' }))
    const form = screen.getByRole('form', { name: 'Aiguilles du patron' })
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), 'trois')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Des tailles en mm')
    await user.clear(within(form).getByLabelText('Aiguilles du patron (mm)'))
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), '3,5 ; 3')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveNeedles).toHaveBeenCalledWith('p1', [3, 3.5])
  })

  it('aiguilles du patron : un enregistrement qui rate le dit, au lieu de ne rien faire', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.saveNeedles.mockRejectedValueOnce(new Error('réseau'))
    renderProject(api, PROJECT, START)
    await openFold('Taille et aiguilles')
    await user.click(await screen.findByRole('button', { name: 'Modifier les aiguilles du patron' }))
    const form = screen.getByRole('form', { name: 'Aiguilles du patron' })
    await user.type(within(form).getByLabelText('Aiguilles du patron (mm)'), '3 ; 3,5')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Les aiguilles n’ont pas pu être enregistrées. Réessaie.')
    // Le formulaire reste ouvert avec la saisie
    expect(within(form).getByLabelText('Aiguilles du patron (mm)')).toHaveValue('3 ; 3,5')
  })

  it('mes échantillons : une liste, un par aiguille ; changer les rangs le fait revérifier', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [{ needle: 3.5, stitches: 22, rows: 30, checked: true }] }
    const { api } = renderProject(fakeApi(), project, START)
    await openFold('Laine et échantillon')
    const list = await screen.findByRole('region', { name: 'Mes échantillons' })
    expect(within(list).getByText('Aiguille 3,5 mm')).toBeInTheDocument()
    expect(within(list).getByText('22 m. × 30 rangs pour 10 cm')).toBeInTheDocument()

    // Modifier ses rangs : la conversion de cette aiguille est à revérifier
    await user.click(within(list).getByRole('button', { name: 'Modifier l’échantillon : Aiguille 3,5 mm' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.clear(within(form).getByLabelText('Rangs'))
    await user.type(within(form).getByLabelText('Rangs'), '28')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: 3.5, stitches: 22, rows: 28, checked: false }])
  })

  it('mes échantillons : ajout pour une autre aiguille, et suppression', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [{ needle: 3.5, stitches: 22, rows: 30, checked: false }] }
    const { api } = renderProject(fakeApi(), project, START)
    await openFold('Laine et échantillon')
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    // L'aiguille déjà notée n'est plus proposée
    expect(Array.from((within(form).getByLabelText('Aiguille') as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Toutes aiguilles', '3 mm', 'Une autre aiguille…'])
    await user.selectOptions(within(form).getByLabelText('Aiguille'), '3 mm')
    await user.type(within(form).getByLabelText('Mailles'), '24')
    await user.type(within(form).getByLabelText('Rangs'), '32')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [
      { needle: 3, stitches: 24, rows: 32, checked: false },
      { needle: 3.5, stitches: 22, rows: 30, checked: false },
    ])

    await user.click(screen.getByRole('button', { name: 'Supprimer l’échantillon : Aiguille 3,5 mm' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [])
  })

  it('mes échantillons : une aiguille hors patron se tape, et les sous-étapes peuvent la choisir', async () => {
    const user = userEvent.setup()
    const project = { ...structuredClone(PROJECT), needles: [3, 3.5], gauges: [] }
    const { api } = renderProject(fakeApi(), project, START)
    await openFold('Laine et échantillon')
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    // Elle tricote trop serré : son échantillon est sur une aiguille que le patron ne conseille pas
    await user.selectOptions(within(form).getByLabelText('Aiguille'), 'Une autre aiguille…')
    await user.type(within(form).getByLabelText('Taille de l’aiguille (mm)'), '4,5')
    await user.type(within(form).getByLabelText('Mailles'), '20')
    await user.type(within(form).getByLabelText('Rangs'), '26')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenLastCalledWith('p1', [{ needle: 4.5, stitches: 20, rows: 26, checked: false }])
  })

  it('mes échantillons : une taille d’aiguille illisible est refusée', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), { ...structuredClone(PROJECT), needles: [3] }, START)
    await openFold('Laine et échantillon')
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.selectOptions(within(form).getByLabelText('Aiguille'), 'Une autre aiguille…')
    await user.type(within(form).getByLabelText('Taille de l’aiguille (mm)'), 'grosses')
    await user.type(within(form).getByLabelText('Mailles'), '20')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Une taille d’aiguille en mm, entre 0,5 et 30')
  })

  it('mes échantillons : sans rien de noté, ou hors de 1 à 100, la saisie est refusée', async () => {
    const user = userEvent.setup()
    renderProject(fakeApi(), { ...structuredClone(PROJECT), needles: [3] }, START)
    await openFold('Laine et échantillon')
    await user.click(await screen.findByRole('button', { name: 'Ajouter un échantillon' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Note au moins les mailles ou les rangs.')
    await user.type(within(form).getByLabelText('Rangs'), '0')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('un nombre entre 1 et 100')
  })
})

describe('Démarrer : laine et échantillon du projet', () => {
  const MERINO = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', length_m: 105, skeins: 8, needle_mm: 4 }

  /** Onglet « Démarrer » du projet, la carte « Laine et échantillon » ouverte. */
  async function renderStart(api = fakeApi(), project: KnitProject = PROJECT) {
    api.knitting.getProject.mockResolvedValue(structuredClone(project))
    const result = renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
    await screen.findByRole('region', { name: 'Laine et échantillon' })
    await openFold('Laine et échantillon')
    return result
  }

  it('ajoute une laine lue sur la photo de l’étiquette', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockResolvedValue({ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', length_m: 125, needle_mm: 3.5 })
    await renderStart(api)
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    expect(within(panel).getByText(/Aucune laine notée/)).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.type(within(dialog).getByLabelText(/Nombre de pelotes/), '6')
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'etiquette.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Marque')).toHaveValue('Phildar'))
    expect(within(dialog).getByLabelText(/Aiguilles/)).toHaveValue('3,5')
    // Le nombre de pelotes saisi reste.
    expect(within(dialog).getByLabelText(/Nombre de pelotes/)).toHaveValue('6')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', {
        yarns: [{ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', length_m: 125, needle_mm: 3.5, skeins: 6 }],
        patternGauge: { stitches: null, rows: null },
      }),
    )
  })

  it('remplit les couleurs du fil vues sur la photo, qu’on ajuste à la main', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockResolvedValue({ ...EMPTY_YARN, brand: 'Drops', hues: ['#7a6a58', '#d8cbb8'] })
    await renderStart(api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    // Couleur choisie avant la photo : remplacée par celles vues sur la photo.
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Indigo' }))
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'etiquette.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Couleur 2')).toHaveValue('#d8cbb8'))
    expect(within(dialog).getByLabelText('Couleur 1')).toHaveValue('#7a6a58')
    await user.click(within(dialog).getByRole('button', { name: 'Retirer la couleur 2' }))
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Gaude' }))
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', {
        yarns: [{ ...EMPTY_YARN, brand: 'Drops', hues: ['#7a6a58', '#e2b93a'] }],
        patternGauge: { stitches: null, rows: null },
      }),
    )
  })

  it('prévient quand une même laine a des bains différents', async () => {
    const yarn = { ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5', color: 'Ciel', skeins: 3 }
    await renderStart(fakeApi(), { ...PROJECT, yarns: [{ ...yarn, dye_lot: '4471' }, { ...yarn, dye_lot: '4480', skeins: 2 }] })
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    expect(within(panel).getAllByTestId('yarn-band')).toHaveLength(2)
    expect(within(panel).getByRole('note')).toHaveTextContent('Bains différents pour Phildar Partner 3.5 · Ciel (4471, 4480)')
  })

  // Les variables --yarn* et leur retrait sont testés dans TricotTheme.test.tsx : ici, la page applique le thème.
  it('la page du projet prend la couleur de sa laine', async () => {
    await renderStart(fakeApi(), { ...PROJECT, yarns: [{ ...EMPTY_YARN, brand: 'Drops' }, { ...EMPTY_YARN, hues: ['#d0563a', '#e8a33a'] }] })
    expect(document.documentElement.style.getPropertyValue('--yarn')).toBe('#d0563a')
  })

  it('garde les couleurs choisies quand la photo n’en montre pas', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockResolvedValue({ ...EMPTY_YARN, brand: 'Phildar' })
    await renderStart(api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter Sauge' }))
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'etiquette.jpg', { type: 'image/jpeg' }))
    await waitFor(() => expect(within(dialog).getByLabelText('Marque')).toHaveValue('Phildar'))
    expect(within(dialog).getByLabelText('Couleur 1')).toHaveValue('#7f9a7a')
  })

  it('signale une étiquette illisible et une saisie invalide', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.readYarnLabel.mockRejectedValue(new AppError('Pas d’étiquette de laine sur cette photo.'))
    await renderStart(api)
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.upload(within(dialog).getByLabelText('Photo de l’étiquette'), new File(['img'], 'chat.jpg', { type: 'image/jpeg' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pas d’étiquette de laine sur cette photo.')
    await user.type(within(dialog).getByLabelText(/Poids/), '12,5')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Poids : un nombre entier de grammes')
    expect(api.knitting.saveProjectInfo).not.toHaveBeenCalled()
  })

  it('montre, modifie et retire les laines', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const yarn = { ...EMPTY_YARN, brand: 'DROPS', name: 'Alpaca', length_m: 167, skeins: 4 }
    await renderStart(api, { ...PROJECT, yarns: [yarn] })
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    expect(within(panel).getByText('DROPS Alpaca')).toBeInTheDocument()
    expect(within(panel).getByText('Environ 668 m de laine en tout.')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Modifier DROPS Alpaca' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifier la laine' })
    await user.clear(within(dialog).getByLabelText('Coloris'))
    await user.type(within(dialog).getByLabelText('Coloris'), '0100 Écru')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [{ ...yarn, color: '0100 Écru' }] })))
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Alpaca' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [] })))
  })

  it('retirer une laine retire sa pesée et garde les autres sur leur laine', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const alpaca = { ...EMPTY_YARN, brand: 'DROPS', name: 'Alpaca' }
    const merino = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino' }
    const kid = { ...EMPTY_YARN, brand: 'DROPS', name: 'Kid-Silk' }
    const checks = [
      { yarn: 0, grams: 50, rowsDone: 10, at: '' },
      { yarn: 1, grams: 40, rowsDone: 10, at: '' },
      { yarn: 2, grams: 20, rowsDone: 10, at: '' },
    ]
    await renderStart(api, { ...PROJECT, yarns: [alpaca, merino, kid], yarnChecks: checks })
    const panel = await screen.findByRole('region', { name: 'Laine et échantillon' })
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Merino' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
    // La laine et ses pesées décalées partent dans la même écriture : jamais l'une sans l'autre
    await waitFor(() =>
      expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', expect.objectContaining({ yarns: [alpaca, kid] }), [
        { yarn: 0, grams: 50, rowsDone: 10, at: '' },
        { yarn: 1, grams: 20, rowsDone: 10, at: '' },
      ]),
    )
    await user.click(within(panel).getByRole('button', { name: 'Supprimer DROPS Kid-Silk' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Supprimer cette laine ?' })).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() =>
      expect(api.knitting.saveProjectInfo).toHaveBeenLastCalledWith('p1', expect.objectContaining({ yarns: [alpaca, merino] }), [
        { yarn: 0, grams: 50, rowsDone: 10, at: '' },
        { yarn: 1, grams: 40, rowsDone: 10, at: '' },
      ]),
    )
    expect(api.knitting.saveYarnChecks).not.toHaveBeenCalled()
  })

  // La saisie et la validation de l'échantillon sont testées plus haut (« mes échantillons ») : ici, son effet sur l'étape.
  it('échantillon changé : l’étape est recalculée avec', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    await renderStart(api, { ...PROJECT, patternGauge: { stitches: 22, rows: 30 }, gauges: [{ needle: null, stitches: 24, rows: 30, checked: false }] })
    // Celui du patron a son propre formulaire ; le sien se modifie dans la liste
    expect(screen.getByLabelText('Mailles du patron')).toHaveValue('22')
    const list = screen.getByRole('region', { name: 'Mes échantillons' })
    await user.click(within(list).getByRole('button', { name: 'Modifier l’échantillon : Toutes aiguilles' }))
    const form = await screen.findByRole('form', { name: 'Échantillon' })
    await user.clear(within(form).getByLabelText('Rangs'))
    await user.type(within(form).getByLabelText('Rangs'), '27')
    api.knitting.getProject.mockResolvedValue({ ...structuredClone(PROJECT), patternGauge: { stitches: 22, rows: 30 }, gauges: [{ needle: null, stitches: 24, rows: 27, checked: false }] })
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(api.knitting.saveGauges).toHaveBeenCalledWith('p1', [{ needle: null, stitches: 24, rows: 27, checked: false }])
    // Étape en cours : 30 rangs, 56 mailles à la fin → 61 mailles à 24 m./10 cm, 27 rangs à 27 rangs/10 cm
    await user.click(screen.getByRole('tab', { name: /2. Préparer/ }))
    await user.click(await screen.findByRole('link', { name: /Emmanchures/ }))
    expect(await screen.findByText('8 / 30 rangs (≈ 27 avec ton échantillon)')).toBeInTheDocument()
    expect(screen.getByText(/56 mailles à la fin \(≈ 61 avec ton échantillon\)/)).toBeInTheDocument()
  })

  it('prend une laine du stock pour un projet', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.listStash.mockResolvedValue([stashItem({ yarn: MERINO })])
    api.knitting.getProject.mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
    await user.click(await screen.findByRole('button', { name: 'Ajouter une laine' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter une laine' })
    await user.selectOptions(await within(dialog).findByLabelText('Prendre dans mon stock'), 'st1')
    expect(within(dialog).getByLabelText('Marque')).toHaveValue('DROPS')
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(api.knitting.saveProjectInfo).toHaveBeenCalledWith('p1', expect.objectContaining({ yarns: [MERINO] })))
  })
})

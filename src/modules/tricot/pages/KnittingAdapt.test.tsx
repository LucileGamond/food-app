import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { adaptationPaused, adaptationToJson, applyAdaptation, describeChange, sanitizeAdaptation, withAdaptedSections, type Adaptation } from '../lib/adapt'
import type { KnitProject, KnitStep, StepSection } from '../lib/pattern'
import { KnittingModePage } from './KnittingModePage'
import { KnittingProjectPage } from './KnittingProjectPage'
import { openFold } from '@/test/openFold'

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos',
  instructions: '',
  totalRows: 100,
  stitches: 88,
  sections: [],
  rowCount: 0,
  times: 1,
  pass: 1,
  notes: '',
  done: false,
  highlights: {},
  ...overrides,
})

const REPEAT: StepSection = { kind: 'repeat', rows: null, every: 8, times: 6, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: null }
const ADAPTED_REPEAT: StepSection = { ...REPEAT, every: 7, times: 7 }

function project(adaptation: Adaptation | null = null): KnitProject {
  return {
    id: 'p1',
    title: 'Pull Bergamote',
    size: 'M',
    sizes: [],
    sizeIndex: null,
    pdfPath: null,
    steps: [step({ id: 's1', title: 'Manches', totalRows: 120, stitches: 60, sections: [REPEAT] }), step({ id: 's2', position: 1, title: 'Col' })],
    charts: [],
    chartHints: [],
    yarns: [],
    patternGauge: { stitches: 22, rows: 30 },
    gauges: [{ needle: null, stitches: 24, rows: 30, checked: false }],
    adaptation,
  }
}

const ADAPTATION: Adaptation = {
  request: '5 cm de plus aux manches',
  active: true,
  at: '2026-11-08T10:00:00Z',
  size: 'M',
  steps: [{ stepId: 's1', totalRows: 136, stitches: 66, sections: [ADAPTED_REPEAT], note: '16 rangs de plus pour 5 cm.' }],
}

/** Page du projet : liste des étapes et cartes repliées. */
const OVERVIEW = '/tricot/p1?onglet=demarrer'

/** Par défaut, l'étape en cours (?etape vide). */
function renderProject(api = fakeApi(), value = project(), route = '/tricot/p1?etape') {
  api.knitting.getProject.mockResolvedValue(value)
  return renderWithApp(<KnittingProjectPage />, { route, path: '/tricot/:id', api })
}

describe('patron adapté : logique', () => {
  it('superpose l’adaptation suivie aux étapes, garde l’origine', () => {
    const steps = project().steps
    expect(applyAdaptation(steps, null, 'M')).toBe(steps)
    expect(applyAdaptation(steps, { ...ADAPTATION, active: false }, 'M')).toBe(steps)
    // Faite pour M, la taille L est suivie : en pause ; une adaptation d'avant (taille non notée) reste suivie
    expect(applyAdaptation(steps, ADAPTATION, 'L')).toBe(steps)
    expect(adaptationPaused(ADAPTATION, 'L')).toBe(true)
    expect(adaptationPaused({ ...ADAPTATION, size: null }, 'L')).toBe(false)
    expect(applyAdaptation(steps, { ...ADAPTATION, size: null }, 'L')).not.toBe(steps)
    const [sleeve, collar] = applyAdaptation(steps, ADAPTATION, 'M')
    expect(sleeve).toMatchObject({ totalRows: 136, stitches: 66, sections: [ADAPTED_REPEAT], adapted: { note: '16 rangs de plus pour 5 cm.', original: { totalRows: 120, stitches: 60 } } })
    expect(collar).toBe(steps[1])
    expect(withAdaptedSections(ADAPTATION, 's1', [REPEAT]).steps[0]!.sections).toEqual([REPEAT])
    expect(describeChange({ totalRows: 120, stitches: 60 }, { totalRows: 136, stitches: 60 })).toBe('120 → 136 rangs')
    expect(describeChange({ totalRows: null, stitches: 60 }, { totalRows: 10, stitches: 66 })).toBe('? → 10 rangs · 60 → 66 mailles')
  })

  it('lit et écrit l’adaptation en base ; une donnée abîmée est ignorée', () => {
    const json = adaptationToJson(ADAPTATION)
    expect(json.steps[0]).toMatchObject({ step_id: 's1', total_rows: 136 })
    expect(sanitizeAdaptation(json)).toEqual(ADAPTATION)
    expect(sanitizeAdaptation(null)).toBeNull()
    expect(sanitizeAdaptation({ active: 'oui', steps: [] })).toBeNull()
    expect(sanitizeAdaptation({ active: true, steps: [{ total_rows: 3 }] })).toBeNull()
    expect(sanitizeAdaptation({ active: true, steps: [{ step_id: 's1', total_rows: 0, sections: 'x', note: 4 }] })).toEqual({
      request: '',
      active: true,
      at: '',
      size: null,
      steps: [{ stepId: 's1', totalRows: null, stitches: null, sections: [], note: '' }],
    })
  })
})

describe('patron adapté : écran', () => {
  it('adapte avec l’échantillon et les retouches, montre l’avant / après puis le suit', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.adaptPattern.mockResolvedValue(ADAPTATION.steps)
    renderProject(api, project(), OVERVIEW)
    await openFold('Patron adapté à moi')
    const panel = await screen.findByRole('region', { name: /Patron adapté à moi/ })
    expect(panel).toHaveTextContent('Ton échantillon : 24 m. × 30 rangs pour 10 cm (celui du patron : 22 m. × 30 rangs pour 10 cm).')
    await user.type(within(panel).getByLabelText('Retouches (facultatif)'), '5 cm de plus aux manches')
    await user.click(within(panel).getByRole('button', { name: 'Adapter avec l’IA' }))
    expect(api.knitting.adaptPattern).toHaveBeenCalledWith({
      request: '5 cm de plus aux manches',
      size: 'M',
      patternGauge: { stitches: 22, rows: 30 },
      myGauge: { stitches: 24, rows: 30 },
      steps: project().steps,
    })
    const dialog = await screen.findByRole('dialog', { name: 'Patron adapté' })
    const list = within(dialog).getByRole('list', { name: 'Étapes adaptées' })
    expect(list).toHaveTextContent('Manches')
    expect(list).toHaveTextContent('120 → 136 rangs · 60 → 66 mailles')
    expect(list).toHaveTextContent('16 rangs de plus pour 5 cm.')

    api.knitting.getProject.mockResolvedValue(project(ADAPTATION))
    await user.click(within(dialog).getByRole('button', { name: 'Suivre ce patron adapté' }))
    await waitFor(() =>
      expect(api.knitting.saveAdaptation).toHaveBeenCalledWith('p1', { request: '5 cm de plus aux manches', active: true, at: expect.any(String), size: 'M', steps: ADAPTATION.steps }),
    )
    // L'étape suit le patron adapté, l'origine reste visible
    await user.click(await screen.findByRole('tab', { name: /2. Préparer/ }))
    await user.click(await screen.findByRole('link', { name: /Manches/ }))
    expect(await screen.findByText(/Patron adapté : 16 rangs de plus pour 5 cm\./)).toBeInTheDocument()
    expect(screen.getByText('Patron d’origine : 120 rangs, 60 mailles à la fin.')).toBeInTheDocument()
    expect(screen.getByText(/\/ 136 rangs/)).toBeInTheDocument()
    // Plus d'estimation (≈) d'après l'échantillon
    expect(screen.queryByText(/avec ton échantillon/)).not.toBeInTheDocument()
  })

  it('bascule vers le patron d’origine, refait ou supprime l’adaptation', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(api, project(ADAPTATION), OVERVIEW)
    await openFold('Patron adapté à moi')
    const panel = await screen.findByRole('region', { name: /Patron adapté à moi/ })
    expect(panel).toHaveTextContent('1 étape adaptée pour « 5 cm de plus aux manches » (taille M).')

    // Pendant l'enregistrement, la case est désactivée (pas deux écritures croisées)
    let saved!: () => void
    api.knitting.saveAdaptation.mockImplementationOnce(() => new Promise<void>((resolve) => (saved = resolve)))
    const follow = within(panel).getByRole('checkbox', { name: 'Suivre le patron adapté' })
    await user.click(follow)
    expect(api.knitting.saveAdaptation).toHaveBeenCalledWith('p1', { ...ADAPTATION, active: false })
    expect(follow).toHaveAttribute('aria-disabled', 'true')
    saved()
    await waitFor(() => expect(follow).not.toHaveAttribute('aria-disabled', 'true'))

    await user.click(within(panel).getByRole('button', { name: 'Refaire l’adaptation' }))
    expect(within(panel).getByLabelText('Retouches (facultatif)')).toHaveValue('5 cm de plus aux manches')
    await user.click(within(panel).getByRole('button', { name: 'Annuler' }))

    await user.click(within(panel).getByRole('button', { name: 'Supprimer l’adaptation' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(api.knitting.saveAdaptation).toHaveBeenCalledWith('p1', null))
  })

  it('adaptation faite pour une autre taille : en pause, à refaire pour la taille suivie', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    renderProject(api, { ...project(ADAPTATION), sizes: ['M', 'L'], sizeIndex: 1 })
    // L'étape suit le patron d'origine (pas les chiffres de M)
    expect(await screen.findByText(/\/ 120 rangs/)).toBeInTheDocument()
    expect(screen.queryByText(/Patron adapté :/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /Pull Bergamote/ }))
    // Le retour d'une étape ramène à « Préparer » ; le patron adapté est dans « Démarrer »
    await user.click(await screen.findByRole('tab', { name: /1. Démarrer/ }))
    await openFold('Patron adapté à moi')
    const panel = await screen.findByRole('region', { name: /Patron adapté à moi/ })
    expect(within(panel).getByRole('status')).toHaveTextContent('Adaptation en pause : elle a été faite pour la taille M, tu suis maintenant la taille L. Refais l’adaptation pour la taille L.')
    expect(within(panel).getByRole('checkbox', { name: 'Suivre le patron adapté' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('patron d’origine suivi : étapes d’origine et estimations (≈) gardées', async () => {
    const api = fakeApi()
    renderProject(api, project({ ...ADAPTATION, active: false }))
    expect(await screen.findByText(/≈ 65 avec ton échantillon/)).toBeInTheDocument()
    expect(screen.getByText(/\/ 120 rangs/)).toBeInTheDocument()
    expect(screen.queryByText(/Patron d’origine :/)).not.toBeInTheDocument()
  })

  it('mode tricoter : suit les chiffres du patron adapté, ou ceux d’origine si l’adaptation est en pause', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(project(ADAPTATION))
    const { unmount } = renderWithApp(<KnittingModePage />, { api, route: '/tricot/p1/tricoter', path: '/tricot/:id/tricoter' })
    expect(await screen.findByText(/\d+ \/ 136 rangs dans l’étape/)).toBeInTheDocument()
    unmount()
    api.knitting.getProject.mockResolvedValue({ ...project(ADAPTATION), sizes: ['M', 'L'], sizeIndex: 1 })
    renderWithApp(<KnittingModePage />, { api, route: '/tricot/p1/tricoter', path: '/tricot/:id/tricoter' })
    expect(await screen.findByText(/\d+ \/ 120 rangs dans l’étape/)).toBeInTheDocument()
  })

  it('patron adapté suivi : les sections réglées vont dans l’adaptation, pas dans le patron d’origine', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    const rows4: StepSection = { kind: 'rows', rows: 4, every: null, times: null, text: 'jersey', pattern: null }
    const adaptation: Adaptation = { ...ADAPTATION, steps: [{ ...ADAPTATION.steps[0]!, sections: [rows4, ADAPTED_REPEAT] }] }
    renderProject(api, project(adaptation))
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 augmentation — tous les 7 rangs (7 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Monter' }))
    await waitFor(() => expect(api.knitting.saveAdaptation).toHaveBeenCalledWith('p1', { ...adaptation, steps: [{ ...adaptation.steps[0]!, sections: [ADAPTED_REPEAT, rows4] }] }))
    expect(api.knitting.saveProgress).not.toHaveBeenCalled()

    api.knitting.saveAdaptation.mockRejectedValueOnce(new AppError('Impossible d’enregistrer le patron adapté.'))
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 1 augmentation — tous les 7 rangs (7 fois) »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Monter' }))
    expect(await screen.findByText('Impossible d’enregistrer le patron adapté.')).toBeInTheDocument()
  })

  it('sans échantillon différent ni retouche : rien à adapter ; erreur lisible', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    api.knitting.adaptPattern.mockRejectedValue(new AppError('L’adaptation du patron a échoué.'))
    renderProject(api, { ...project(), gauges: [] }, OVERVIEW)
    await openFold('Patron adapté à moi')
    const panel = await screen.findByRole('region', { name: /Patron adapté à moi/ })
    expect(panel).toHaveTextContent('seules tes retouches seront appliquées')
    expect(within(panel).getByRole('button', { name: 'Adapter avec l’IA' })).toBeDisabled()
    await user.type(within(panel).getByLabelText('Retouches (facultatif)'), 'Corps plus court de 3 cm')
    await user.click(within(panel).getByRole('button', { name: 'Adapter avec l’IA' }))
    expect(await screen.findByText('L’adaptation du patron a échoué.')).toBeInTheDocument()
  })
})

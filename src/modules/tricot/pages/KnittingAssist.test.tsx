import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { EMPTY_YARN } from '../lib/yarn'
import type { KnitProject, KnitStep } from '../lib/pattern'
import { KnittingModePage } from './KnittingModePage'
import { KnittingProjectPage } from './KnittingProjectPage'
import { openFold } from '@/test/openFold'

const step = (overrides: Partial<KnitStep>): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos',
  instructions: '',
  totalRows: 100,
  stitches: null,
  sections: [],
  rowCount: 0,
  times: 1,
  pass: 1,
  notes: '',
  done: false,
  highlights: {},
  translation: null,
  ...overrides,
})

const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  sizes: ['S', 'M', 'L'],
  sizeIndex: 1,
  pdfPath: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
  steps: [step({ id: 's1', instructions: 'Tricoter 2 m. ens. puis 1 jeté, C4F.', rowCount: 11 })],
  charts: [],
  chartHints: [],
  abbreviations: [{ abbr: 'C4F', meaning: 'Torsade de 4 mailles croisées devant.' }],
  yarnChecks: [],
}

const OVERVIEW = '/tricot/p1'

/** Par défaut, l'étape en cours (?etape vide) ; OVERVIEW : la page du projet. */
function renderProject(project: KnitProject = PROJECT, api = fakeApi(), route = '/tricot/p1?etape') {
  api.knitting.getProject.mockResolvedValue(structuredClone(project))
  return { ...renderWithApp(<KnittingProjectPage />, { api, route, path: '/tricot/:id' }), api }
}

/** Mode tricoter, sur l'étape en cours. */
function renderMode(project: KnitProject = PROJECT, api = fakeApi()) {
  api.knitting.getProject.mockResolvedValue(structuredClone(project))
  return { ...renderWithApp(<KnittingModePage />, { api, route: '/tricot/p1/tricoter', path: '/tricot/:id/tricoter' }), api }
}

/** Ouvre le volet « Patron » du mode tricoter. */
async function openPattern(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('Patron', { selector: 'summary *, summary' }))
}

beforeEach(() => localStorage.clear())

describe('abréviations expliquées', () => {
  it('explique les abréviations du texte, celles du patron d’abord', async () => {
    const user = userEvent.setup()
    renderProject()
    await user.click(await screen.findByRole('button', { name: 'jeté : explication' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/Passer le fil sur l’aiguille droite/)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'C4F : explication' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Torsade de 4 mailles croisées devant.')
  })

})

describe('patron en anglais', () => {
  const ENGLISH = { ...PROJECT, steps: [step({ id: 's1', instructions: 'Row 1 (RS): knit 60 (64-68) sts. Row 2: purl to end. Repeat rows 1-2.' })] }

  it('traduit l’étape en français et garde le texte d’origine à côté', async () => {
    const user = userEvent.setup()
    const { api } = renderProject(ENGLISH)
    api.knitting.translateText.mockResolvedValue({ text: 'Rang 1 (end.) : tricoter 60 (64-68) m. Rang 2 : envers. Répéter les rangs 1-2.', numbersKept: true })
    await user.click(await screen.findByRole('button', { name: 'Traduire en français' }))
    expect(api.knitting.translateText).toHaveBeenCalledWith(ENGLISH.steps[0]!.instructions)
    await waitFor(() => expect(api.knitting.saveProgress).toHaveBeenCalledWith('s1', { translation: 'Rang 1 (end.) : tricoter 60 (64-68) m. Rang 2 : envers. Répéter les rangs 1-2.' }))
    const translation = await screen.findByRole('region', { name: 'Traduction en français' })
    // Nombres de la taille toujours surlignés dans la traduction
    expect(within(translation).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64'])
    expect(screen.getByText('Texte d’origine (anglais)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Traduire en français' })).not.toBeInTheDocument()
  })

  it('prévient si la traduction a changé des nombres ; pas de traduction proposée en français', async () => {
    const user = userEvent.setup()
    const { api } = renderProject(ENGLISH)
    api.knitting.translateText.mockResolvedValue({ text: 'Rang 1 : tricoter 64 m.', numbersKept: false })
    await user.click(await screen.findByRole('button', { name: 'Traduire en français' }))
    expect(await screen.findByText('Vérifie les nombres : la traduction en a changé certains.')).toBeInTheDocument()
  })

  it('pas de traduction pour un patron en français', async () => {
    renderProject()
    expect(await screen.findByRole('heading', { name: 'Dos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Traduire en français' })).not.toBeInTheDocument()
  })
})

describe('question sur le rang', () => {
  it('pose une question avec l’étape, le rang et la taille en contexte', async () => {
    const user = userEvent.setup()
    const { api } = renderMode()
    api.knitting.askAboutStep.mockResolvedValue('Tricote 2 mailles ensemble, puis fais un jeté.')
    await openPattern(user)
    await user.click(await screen.findByRole('button', { name: 'Une question sur ce rang ?' }))
    const section = screen.getByRole('region', { name: 'Question sur ce rang' })
    await user.click(within(section).getByRole('button', { name: 'Demander' }))
    expect(within(section).getByRole('alert')).toHaveTextContent('Écris ta question.')
    await user.type(within(section).getByLabelText('Ta question sur le rang 12'), 'Je ne comprends pas')
    await user.click(within(section).getByRole('button', { name: 'Demander' }))
    expect(api.knitting.askAboutStep).toHaveBeenCalledWith({
      question: 'Je ne comprends pas',
      stepTitle: 'Dos',
      text: PROJECT.steps[0]!.instructions,
      row: 12,
      size: 'M',
      abbreviations: PROJECT.abbreviations,
    })
    expect(await within(section).findByRole('status')).toHaveTextContent('Tricote 2 mailles ensemble, puis fais un jeté.')
    await user.click(within(section).getByRole('button', { name: 'Fermer' }))
    expect(screen.getByRole('button', { name: 'Une question sur ce rang ?' })).toBeInTheDocument()
  })

  it('montre l’erreur de la réponse', async () => {
    const user = userEvent.setup()
    const { api } = renderMode()
    api.knitting.askAboutStep.mockRejectedValue(new Error('réseau'))
    await openPattern(user)
    await user.click(await screen.findByRole('button', { name: 'Une question sur ce rang ?' }))
    await user.type(screen.getByLabelText('Ta question sur le rang 12'), 'ssk ?')
    await user.click(screen.getByRole('button', { name: 'Demander' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue.')
  })
})

describe('assez de laine pour finir ?', () => {
  const YARN = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', color: 'Ciel', weight_g: 50, length_m: 100, skeins: 10 }
  const CONTRAST = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', color: 'Rouille', weight_g: 50, length_m: 100, skeins: 2 }
  const WITH_YARN = { ...PROJECT, yarns: [YARN, CONTRAST], steps: [step({ id: 's1', totalRows: 100, rowCount: 100, done: true }), step({ id: 's2', title: 'Devant', totalRows: 100 })] }

  it('pèse chaque laine à part et garde les pesées des autres', async () => {
    const user = userEvent.setup()
    const project = { ...WITH_YARN, yarnChecks: [{ yarn: 0, grams: 220, rowsDone: 100, at: '2026-11-08' }] }
    const { api } = renderProject(project, undefined, OVERVIEW)
    await openFold('Assez de laine pour finir ?')
    const card = await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })
    const contrast = within(card).getByRole('group', { name: 'DROPS Merino · Rouille' })
    await user.type(within(contrast).getByLabelText('Laine restante (g)'), 'beaucoup')
    await user.click(within(contrast).getByRole('button', { name: 'Estimer' }))
    expect(within(contrast).getByRole('alert')).toHaveTextContent('Indique le poids en grammes')
    await user.clear(within(contrast).getByLabelText('Laine restante (g)'))
    await user.type(within(contrast).getByLabelText('Laine restante (g)'), '40,5')
    await user.click(within(contrast).getByRole('button', { name: 'Estimer' }))
    await waitFor(() =>
      expect(api.knitting.saveYarnChecks).toHaveBeenCalledWith('p1', [project.yarnChecks[0], expect.objectContaining({ yarn: 1, grams: 40.5, rowsDone: 100 })]),
    )
  })

  it('dit pour chaque laine s’il en manque', async () => {
    renderProject({
      ...WITH_YARN,
      yarnChecks: [
        { yarn: 0, grams: 220, rowsDone: 100, at: '2026-11-08' },
        { yarn: 1, grams: 60, rowsDone: 100, at: '' },
      ],
    }, undefined, OVERVIEW)
    await openFold('Assez de laine pour finir ?')
    const card = await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })
    const main = within(card).getByRole('group', { name: 'DROPS Merino · Ciel' })
    expect(within(main).getByRole('status')).toHaveTextContent('Il manque ≈ 120 m, soit 2 pelotes.')
    expect(within(main).getByRole('status')).toHaveTextContent('≈ 440 m restants · ≈ 560 m pour finir · pesée à 100 rangs')
    // Rouille : 60 g = 120 m restants, 80 m tricotés pour la moitié → 80 m pour finir
    expect(within(within(card).getByRole('group', { name: 'DROPS Merino · Rouille' })).getByRole('status')).toHaveTextContent('Ça passe.')
  })

  it('demande de compléter la laine', async () => {
    renderProject({ ...PROJECT, yarns: [{ ...EMPTY_YARN, name: 'Alpaga' }], yarnChecks: [{ yarn: 0, grams: 50, rowsDone: 10, at: '' }] }, undefined, OVERVIEW)
    await openFold('Assez de laine pour finir ?')
    const card = await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })
    expect(within(card).getByRole('status')).toHaveTextContent('Complète cette laine')
  })

  it('sans laine, propose de l’ajouter', async () => {
    renderProject(PROJECT, undefined, OVERVIEW)
    await openFold('Assez de laine pour finir ?')
    const card = await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })
    expect(within(card).getByText(/Ajoute la laine du projet/)).toBeInTheDocument()
  })
})

describe('hors ligne', () => {
  it('compte les rangs sans réseau, puis les envoie au retour du réseau', async () => {
    const user = userEvent.setup()
    const { api } = renderMode()
    await screen.findByRole('heading', { name: 'Dos' })
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
      expect(api.knitting.saveProgress).not.toHaveBeenCalled()
      expect(screen.getByText(/Hors ligne : tu tricotes sur la version gardée sur ce téléphone/)).toBeInTheDocument()

      online.mockReturnValue(true)
      api.knitting.getProject.mockResolvedValue({ ...structuredClone(PROJECT), steps: [{ ...PROJECT.steps[0]!, rowCount: 13 }] })
      await act(async () => {
        window.dispatchEvent(new Event('online'))
      })
      await waitFor(() => expect(api.knitting.saveProgress).toHaveBeenCalledWith('s1', { rowCount: 13 }))
      await waitFor(() => expect(screen.queryByText(/Hors ligne/)).not.toBeInTheDocument())
    } finally {
      online.mockRestore()
    }
  })

  it('ouvre la version gardée sur le téléphone quand le projet ne se charge pas', async () => {
    const first = renderProject()
    await screen.findByRole('heading', { name: 'Dos' })
    first.unmount()

    const api = fakeApi()
    api.knitting.getProject.mockRejectedValue(new Error('réseau'))
    renderWithApp(<KnittingProjectPage />, { api, route: '/tricot/p1?etape', path: '/tricot/:id' })
    expect(await screen.findByRole('heading', { name: 'Dos' })).toBeInTheDocument()
    expect(screen.getByText(/Hors ligne/)).toBeInTheDocument()
  })

  it('garde l’avancée si l’envoi échoue en perdant le réseau', async () => {
    const user = userEvent.setup()
    const { api } = renderMode()
    await screen.findByRole('heading', { name: 'Dos' })
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    api.knitting.saveProgress.mockImplementationOnce(async () => {
      online.mockReturnValue(false)
      throw new Error('réseau')
    })
    try {
      await user.click(screen.getByRole('button', { name: 'Ajouter 1 rang' }))
      expect(await screen.findByText(/Hors ligne/)).toBeInTheDocument()
      expect(JSON.parse(localStorage.getItem('life:tricot:en-attente')!)).toEqual({ s1: { projectId: 'p1', progress: { rowCount: 12 } } })
    } finally {
      online.mockRestore()
    }
  })
})

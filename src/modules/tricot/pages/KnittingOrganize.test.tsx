// Organiser les étapes : regrouper, séparer, déplacer une sous-étape (dans son étape ou vers une autre).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi, renderWithApp } from '@/test/fakes'
import type { KnitProject, KnitStep, StepSection } from '../lib/pattern'
import { KnittingProjectPage } from './KnittingProjectPage'

const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })
const step = (id: string, position: number, title: string, sections: StepSection[], patch: Partial<KnitStep> = {}): KnitStep => ({
  id,
  position,
  title,
  instructions: '',
  totalRows: sections.reduce((n, s) => n + (s.rows ?? 0), 0) || null,
  stitches: null,
  sections,
  rowCount: 0,
  times: 1,
  pass: 1,
  notes: '',
  done: false,
  highlights: {},
  translation: null,
  ...patch,
})

const PROJECT: KnitProject = {
  id: 'p1',
  title: 'Pull',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  gauges: [],
  charts: [],
  chartHints: [],
  abbreviations: [],
  yarnChecks: [],
  steps: [
    step('s1', 0, 'Dos – côtes', [rows(18, 'côtes')]),
    step('s2', 1, 'Dos – jersey', [rows(40, 'jersey'), rows(20, 'emmanchures')]),
    step('s3', 2, 'Manche', [rows(24, 'côtes')]),
  ],
}

function open(project: KnitProject = PROJECT) {
  const api = fakeApi()
  api.knitting.getProject.mockResolvedValue(structuredClone(project))
  // Organiser : une vue de l'onglet « Préparer » du projet
  renderWithApp(<KnittingProjectPage />, { api, route: '/tricot/p1?onglet=preparer&vue=organiser', path: '/tricot/:id' })
  return api
}

const actions = (label: string) => screen.findByRole('button', { name: `Actions pour « ${label} »` })

describe('organiser les étapes', () => {
  it('regroupe une étape avec la suivante', async () => {
    const user = userEvent.setup()
    const api = open()
    await user.click(await screen.findByRole('button', { name: 'Regrouper avec « Dos – jersey »' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Regrouper avec l’étape suivante ?' })
    expect(dialog).toHaveTextContent('« Dos – jersey » devient la suite de « Dos – côtes »')
    await user.click(within(dialog).getByRole('button', { name: 'Regrouper' }))
    expect(api.knitting.mergeSteps).toHaveBeenCalledWith('s1', { sections: [rows(18, 'côtes'), rows(40, 'jersey'), rows(20, 'emmanchures')], totalRows: 78 })
    expect(api.knitting.getProject).toHaveBeenCalledTimes(2)
    // Chaque étape sauf la dernière propose de regrouper, en nommant la suivante
    expect(screen.getAllByRole('button', { name: /^Regrouper avec/ }).map((b) => b.textContent?.trim())).toEqual(['Regrouper avec « Dos – jersey »', 'Regrouper avec « Manche »'])
  })

  it('déplace une sous-étape vers une autre étape, à la fin', async () => {
    const user = userEvent.setup()
    const api = open()
    await user.click(await actions('20 rangs : emmanchures'))
    await user.click(await screen.findByRole('menuitem', { name: 'Déplacer vers une autre étape' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Déplacer vers une autre étape' })
    expect(within(dialog).getByRole('button', { name: 'Déplacer' })).toBeDisabled()
    await user.selectOptions(within(dialog).getByLabelText('Étape'), '3. Manche')
    await user.click(within(dialog).getByRole('button', { name: 'Déplacer' }))
    expect(api.knitting.saveSections).toHaveBeenCalledWith([
      { id: 's2', sections: [rows(40, 'jersey')], totalRows: 40, instructions: '' },
      { id: 's3', sections: [rows(24, 'côtes'), rows(20, 'emmanchures')], totalRows: 44, instructions: '' },
    ])
  })

  it('monte une sous-étape dans son étape, et sépare une étape en deux', async () => {
    const user = userEvent.setup()
    const api = open()
    await user.click(await actions('20 rangs : emmanchures'))
    await user.click(await screen.findByRole('menuitem', { name: 'Monter' }))
    expect(api.knitting.saveSections).toHaveBeenCalledWith([{ id: 's2', sections: [rows(20, 'emmanchures'), rows(40, 'jersey')], totalRows: 60, instructions: '' }])

    await user.click(await actions('20 rangs : emmanchures'))
    await user.click(await screen.findByRole('menuitem', { name: 'Nouvelle étape à partir d’ici' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Nouvelle étape à partir d’ici ?' })).getByRole('button', { name: 'Séparer' }))
    expect(api.knitting.splitStep).toHaveBeenCalledWith('s2', {
      first: { sections: [rows(40, 'jersey')], totalRows: 40, instructions: '' },
      second: { title: 'Dos – jersey (suite)', sections: [rows(20, 'emmanchures')], totalRows: 20, instructions: '' },
    })
  })

  it('une étape commencée ou un patron adapté ne se réorganise pas', async () => {
    open({ ...PROJECT, steps: [PROJECT.steps[0]!, { ...PROJECT.steps[1]!, rowCount: 3 }, PROJECT.steps[2]!] })
    expect(await actions('40 rangs : jersey')).toBeDisabled()
    // Bloqué, avec la raison affichée
    expect(screen.getByRole('button', { name: 'Regrouper avec « Dos – jersey »' })).toBeDisabled()
    expect(screen.getByText('L’étape suivante est commencée : elle ne peut plus être regroupée.')).toBeInTheDocument()
    expect(screen.getByText('Commencée : ses sous-étapes ne bougent plus.')).toBeInTheDocument()
  })

  it('patron adapté : tout est bloqué, avec l’explication', async () => {
    open({ ...PROJECT, adaptation: { active: false, request: 'plus long', at: '2026-11-12', size: 'M', steps: [] } })
    expect(await screen.findByRole('status')).toHaveTextContent('Le patron a une adaptation')
    expect(screen.getByRole('button', { name: 'Actions pour « 18 rangs : côtes »' })).toBeDisabled()
  })
})

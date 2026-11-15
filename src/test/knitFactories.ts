// Fabriques de données du Tricot pour les tests : des valeurs neutres, à surcharger pour ce que le test vérifie.

import type { KnitPattern } from '@/modules/tricot/lib/library'
import type { KnitProject, KnitStep, RepeatAction, StepSection } from '@/modules/tricot/lib/pattern'
import { EMPTY_YARN, type StashItem } from '@/modules/tricot/lib/yarn'

/** Étape pas commencée, sans sous-étape ni nombre de rangs connu. */
export const knitStep = (overrides: Partial<KnitStep> = {}): KnitStep => ({
  id: 's1',
  position: 0,
  title: 'Dos',
  instructions: '',
  totalRows: null,
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

/** Projet « Pull Bergamote », taille M, une étape, sans laine, échantillon, diagramme ni PDF. */
export const knitProject = (overrides: Partial<KnitProject> = {}): KnitProject => ({
  id: 'p1',
  title: 'Pull Bergamote',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  steps: [knitStep()],
  charts: [],
  chartHints: [],
  abbreviations: [],
  yarnChecks: [],
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  gauges: [],
  ...overrides,
})

/** Sous-étape de `n` rangs (« 4 rangs : jersey »). */
export const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })

/** Répétition : les actions tous les `every` rangs, `times` fois (null : jusqu'à la fin de l'étape). */
export const repeat = (every: number, times: number | null, actions: RepeatAction[] | undefined): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  actions,
  text: '',
  pattern: null,
})

/** Laine du stock, sans rien de noté. */
export const stashItem = (overrides: Partial<StashItem> = {}): StashItem => ({
  id: 'st1',
  yarn: EMPTY_YARN,
  notes: '',
  createdAt: '2026-11-01',
  ...overrides,
})

/** Patron de la bibliothèque, sans fichier ni besoin noté. */
export const knitPattern = (overrides: Partial<KnitPattern> = {}): KnitPattern => ({
  id: 'g1',
  title: 'Gilet Rosée',
  pdfPath: null,
  photos: [],
  url: null,
  size: null,
  yarnIdea: '',
  notes: '',
  metersNeeded: null,
  needleMm: null,
  tags: [],
  createdAt: '2026-11-01T10:00:00Z',
  projects: [],
  readSizes: [],
  ...overrides,
})

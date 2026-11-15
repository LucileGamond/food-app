// Données et rendu partagés par les tests des pages du Tricot (accueil, import, stock, projet).

import { Route } from 'react-router-dom'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { knitProject, knitStep } from '@/test/knitFactories'
import { unfoldStepParts } from '@/test/openFold'
import type { KnitProject, KnitStep, ReadPattern } from '../lib/pattern'
import { KnittingProjectPage } from './KnittingProjectPage'

/** Étape « Dos – côtes » : 18 rangs, 64 mailles à la fin. */
export const step = (overrides: Partial<KnitStep>): KnitStep =>
  knitStep({ title: 'Dos – côtes', instructions: 'Monter 64 m.', totalRows: 18, stitches: 64, ...overrides })

/** Pull Bergamote : 1re étape terminée, 2e en cours (8 / 30 rangs, deux sous-étapes), 3e sans rangs connus. */
export const PROJECT: KnitProject = knitProject({
  pdfPath: 'u-lucile/abc.pdf',
  steps: [
    step({ id: 's1', done: true, rowCount: 18 }),
    step({
      id: 's2',
      position: 1,
      title: 'Emmanchures',
      instructions: 'Tricoter 4 rangs, puis diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
      totalRows: 30,
      stitches: 56,
      rowCount: 8,
      sections: [
        { kind: 'rows', rows: 4, every: null, times: null, text: 'jersey', pattern: null },
        { kind: 'repeat', rows: null, every: 6, times: 4, text: '1 diminution de chaque côté', pattern: null },
      ],
    }),
    step({ id: 's3', position: 2, title: 'Encolure', totalRows: null, stitches: null }),
  ],
})

/** Le patron lu pour PROJECT. */
export const PATTERN: ReadPattern = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  gauge: { stitches: 22, rows: 30 },
  steps: PROJECT.steps.map(({ title, instructions, totalRows, stitches, sections }) => ({ title, instructions, totalRows, stitches, sections })),
}

/** Page du projet : liste des étapes et cartes repliées ; STEP : l'étape en cours (?etape vide). */
export const OVERVIEW = '/tricot/p1'
/** Onglets du projet : 1 Démarrer (matériel), 2 Préparer (étapes). */
export const START = '/tricot/p1?onglet=demarrer'
export const PREPARE = '/tricot/p1?onglet=preparer'
export const STEP = '/tricot/p1?etape'

/** Page du projet ; sur une étape, ses blocs (texte, sous-étapes…) se déplient d'office. */
export function renderProject(api = fakeApi(), project: KnitProject | null = PROJECT, route = STEP) {
  if (route.includes('etape')) unfoldStepParts()
  api.knitting.getProject.mockResolvedValue(project && structuredClone(project))
  return renderWithApp(<KnittingProjectPage />, {
    api,
    route,
    path: '/tricot/:id',
    extraRoutes: <Route path="/tricot" element={<p>Liste des projets</p>} />,
  })
}

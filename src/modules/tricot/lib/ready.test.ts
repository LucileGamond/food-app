import type { StepSection } from './pattern'
import { isReady, readyIssues } from './ready'

const rows = (n: number | null, text: string, pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern })
const measured = { rowsPer10: 30, source: 'pattern' as const }

describe('étape prête à tricoter', () => {
  it('prête : rangs connus et calculs vérifiés ; une étape sans sous-étape aussi', () => {
    expect(isReady({ sections: [rows(10, 'côtes'), rows(20, 'jersey')] })).toBe(true)
    expect(isReady({ sections: [] })).toBe(true)
  })

  it('dit ce qui manque, sous-étape par sous-étape', () => {
    const sections: StepSection[] = [
      rows(10, 'côtes'),
      rows(null, 'jersey', '30 cm'),
      { kind: 'repeat', rows: null, every: null, times: 4, actions: [{ text: '1 aug.', rank: null }], text: '', pattern: 'tous les 5 cm' },
      { ...rows(15, 'jersey', '5 cm'), measured },
      { ...rows(4, 'encolure'), at: { row: null, pattern: '15 cm' } },
      { ...rows(4, 'col'), at: { row: 46, pattern: '15 cm', measured } },
    ]
    expect(readyIssues({ sections }).map((i) => [i.index, i.text])).toEqual([
      [1, 'Sous-étape 2 (30 cm (à régler) : jersey) : nombre de rangs à régler.'],
      [2, 'Sous-étape 3 (1 aug. — tous les 5 cm (rangs à régler)) : rythme en rangs à régler.'],
      [3, 'Sous-étape 4 (15 rangs (≈ 5 cm) : jersey) : calcul à vérifier (5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ 15 rangs).'],
      [4, 'Sous-étape 5 (En même temps, à 15 cm (à régler) : 4 rangs : encolure) : rang de début « en même temps » à régler.'],
      [5, 'Sous-étape 6 (En même temps, dès le rang 46 (≈ 15 cm) : 4 rangs : col) : calcul à vérifier (début : 15 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ rang 46).'],
    ])
  })
})

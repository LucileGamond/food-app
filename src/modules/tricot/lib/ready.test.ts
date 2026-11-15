import type { StepSection } from './pattern'
import { isReady, readyIssues, rowsOverflow } from './ready'

const rows = (n: number | null, text: string, pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern })
const measured = { rowsPer10: 30, source: 'pattern' as const }
const onNeedle = (section: StepSection, needle: number): StepSection => ({ ...section, needle })

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

  it('calcul déjà vérifié pour son aiguille : plus rien à vérifier, sur cette aiguille seulement', () => {
    const converted = { ...rows(15, 'jersey', '5 cm'), measured }
    const gauges = [{ needle: 4, stitches: null, rows: 30, checked: true }]
    expect(readyIssues({ sections: [onNeedle(converted, 4)] }, [4], gauges)).toEqual([])
    expect(readyIssues({ sections: [onNeedle(converted, 3)] }, [3, 4], gauges).map((i) => i.what)).toEqual([
      'calcul à vérifier (5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ 15 rangs)',
    ])
  })

  it('aiguille à choisir quand le projet en a plusieurs, sauf héritée', () => {
    const step = { sections: [rows(10, 'côtes'), onNeedle(rows(30, 'jersey'), 3.5), rows(4, 'jersey')] }
    expect(readyIssues(step, [3, 3.5]).map((i) => i.text)).toEqual(['Sous-étape 1 (10 rangs : côtes) : aiguille à choisir.'])
    expect(readyIssues({ ...step, needleFrom: 3 }, [3, 3.5])).toEqual([])
    // Une seule aiguille : elle vaut partout ; aucune au projet : rien n'est demandé
    expect(readyIssues(step, [3.5])).toEqual([])
    expect(readyIssues(step, [])).toEqual([])
  })
})

describe('sous-étapes plus longues que l’étape', () => {
  it('signale la première sous-étape qui dépasse le total annoncé', () => {
    const sections = [rows(10, 'côtes'), rows(20, 'jersey'), rows(5, 'encolure')]
    expect(rowsOverflow({ sections, totalRows: 25 })).toEqual({ end: 35, total: 25, index: 1 })
  })

  it('rien à signaler si elles tiennent, ou si le total est inconnu', () => {
    const sections = [rows(10, 'côtes'), rows(20, 'jersey')]
    expect(rowsOverflow({ sections, totalRows: 30 })).toBeNull()
    expect(rowsOverflow({ sections, totalRows: null })).toBeNull()
    expect(rowsOverflow({ sections })).toBeNull()
  })

  it('signalé sans bloquer : le mode tricoter reste ouvert', () => {
    const step = { sections: [rows(10, 'côtes'), rows(20, 'jersey')], totalRows: 25 }
    const [issue] = readyIssues(step)
    expect(issue).toMatchObject({ index: 1, blocking: false, what: 'sous-étapes plus longues que l’étape (jusqu’au rang 30, pour 25 rangs annoncés)' })
    expect(isReady(step)).toBe(true)
  })
})

import type { StepSection } from './pattern'
import { defaultTab, isProjectTab, startIssues, stepsToPrepare } from './phases'

const rows = (n: number | null, text: string, pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern })
const step = (sections: StepSection[], progress: { done?: boolean; rowCount?: number } = {}) => ({ sections, done: false, rowCount: 0, ...progress })
const noGauge = { stitches: null, rows: null }

const PROJECT = {
  sizes: [] as string[],
  sizeIndex: null as number | null,
  size: 'M',
  needles: [4],
  patternGauge: noGauge,
  gauges: [],
  steps: [step([rows(10, 'côtes')]), step([rows(20, 'jersey')])],
}

describe('démarrer un projet : ce qui manque au matériel', () => {
  it('rien : aiguilles indiquées, pas de hauteur en cm, une seule taille', () => {
    expect(startIssues(PROJECT)).toEqual([])
  })

  it('aiguilles à indiquer', () => {
    expect(startIssues({ ...PROJECT, needles: [] })).toEqual(['Aiguilles à indiquer'])
  })

  it('taille à choisir : plusieurs tailles, aucune choisie, celle de l’import n’en fait pas partie', () => {
    expect(startIssues({ ...PROJECT, sizes: ['S', 'L'], size: 'Unique' })).toEqual(['Taille à choisir'])
    // Choisie, ou celle de l'import est dans la liste : rien à faire
    expect(startIssues({ ...PROJECT, sizes: ['S', 'L'], size: 'Unique', sizeIndex: 1 })).toEqual([])
    expect(startIssues({ ...PROJECT, sizes: ['S', 'M'] })).toEqual([])
  })

  it('échantillon à noter seulement si le patron donne des hauteurs en cm, et qu’aucun échantillon n’est connu', () => {
    const steps = [step([rows(null, 'jersey', '30 cm')]), step([{ ...rows(4, 'col'), at: { row: null, pattern: 'à 15 cm' } }])]
    expect(startIssues({ ...PROJECT, steps })).toEqual(['Échantillon à noter (le patron donne des hauteurs en cm)'])
    expect(startIssues({ ...PROJECT, steps: [steps[1]!] })).toHaveLength(1)
    expect(startIssues({ ...PROJECT, steps, gauges: [{ needle: null, stitches: 22, rows: 30, checked: false }] })).toEqual([])
    expect(startIssues({ ...PROJECT, steps, patternGauge: { stitches: null, rows: 28 } })).toEqual([])
    expect(startIssues({ ...PROJECT, steps, gauges: [{ needle: 4, stitches: null, rows: 30, checked: false }] })).toEqual([])
    // Mailles seules : pas de quoi convertir des cm en rangs
    expect(startIssues({ ...PROJECT, steps, gauges: [{ needle: null, stitches: 22, rows: null, checked: false }] })).toHaveLength(1)
  })
})

describe('étapes à préparer', () => {
  it('compte les étapes pas terminées et pas prêtes', () => {
    const steps = [step([rows(null, 'a')], { done: true }), step([rows(null, 'b')]), step([rows(4, 'c')]), step([rows(null, 'd')])]
    expect(stepsToPrepare(steps, [], [])).toBe(2)
    // Plusieurs aiguilles sans choix : pas prête
    expect(stepsToPrepare([step([rows(4, 'c')])], [3, 4], [])).toBe(1)
  })
})

describe('onglet ouvert d’office', () => {
  it('Démarrer tant que le matériel manque et que rien n’est tricoté', () => {
    expect(defaultTab({ ...PROJECT, needles: [] })).toBe('demarrer')
    // Déjà commencé : on ne renvoie plus au démarrage
    expect(defaultTab({ ...PROJECT, needles: [], steps: [step([rows(10, 'a')], { rowCount: 3 })] })).toBe('tricoter')
    expect(defaultTab({ ...PROJECT, needles: [], steps: [step([rows(10, 'a')], { done: true }), step([rows(4, 'b')])] })).toBe('tricoter')
  })

  it('Préparer si l’étape en cours n’est pas prête (même si une autre plus loin ne l’est pas non plus)', () => {
    expect(defaultTab({ ...PROJECT, steps: [step([rows(null, 'a')]), step([rows(4, 'b')])] })).toBe('preparer')
    expect(defaultTab({ ...PROJECT, steps: [step([rows(4, 'a')]), step([rows(null, 'b')])] })).toBe('tricoter')
    expect(defaultTab({ ...PROJECT, steps: [step([rows(4, 'a')], { done: true }), step([rows(null, 'b')])] })).toBe('preparer')
  })

  it('Tricoter quand tout est prêt, projet fini ou sans étape', () => {
    expect(defaultTab(PROJECT)).toBe('tricoter')
    expect(defaultTab({ ...PROJECT, steps: [step([rows(null, 'a')], { done: true })] })).toBe('tricoter')
    expect(defaultTab({ ...PROJECT, steps: [] })).toBe('tricoter')
  })

  it('reconnaît les onglets de l’adresse', () => {
    expect(['demarrer', 'preparer', 'tricoter', 'autre', null].map(isProjectTab)).toEqual([true, true, true, false, false])
  })
})

import {
  alertsAt,
  currentStepIndex,
  describeRange,
  describeSection,
  formToSection,
  nextActionRow,
  planSections,
  sectionIndexAt,
  sectionToForm,
  type StepSection,
} from './pattern'

const rows = (n: number | null, text = '', pattern: string | null = null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern })
const repeat = (every: number | null, times: number | null, text = '1 diminution', pattern: string | null = null): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  text,
  pattern,
})

// 4 rangs, puis 1 diminution tous les 6 rangs (4 fois), puis 10 rangs, puis 1 augmentation tous les 8 rangs jusqu'à la fin
const SECTIONS = [rows(4, 'jersey'), repeat(6, 4), rows(10), repeat(8, null, '1 augmentation')]

describe('sections d’une étape', () => {
  it('enchaîne les rangs des sections', () => {
    const plan = planSections(SECTIONS, 60)
    expect(plan.map((p) => [p.start, p.end, p.actionRows])).toEqual([
      [1, 4, []],
      [5, 28, [10, 16, 22, 28]],
      [29, 38, []],
      [39, 60, [46, 54]],
    ])
    expect(plan.map(describeRange)).toEqual(['Rangs 1 à 4', 'Rangs 5 à 28', 'Rangs 29 à 38', 'Rangs 39 à 60'])
  })

  it('ne calcule pas la suite d’une section à régler', () => {
    const plan = planSections([rows(4), repeat(null, 3, '1 augmentation', 'tous les 5 cm'), rows(10)], null)
    expect(plan.map((p) => [p.start, p.end])).toEqual([
      [1, 4],
      [5, null],
      [null, null],
    ])
    expect(plan.map(describeRange)).toEqual(['Rangs 1 à 4', 'À partir du rang 5', null])
    expect(planSections([rows(null, '', '5 cm'), rows(2)], null).map((p) => p.start)).toEqual([1, null])
    // Répétition jusqu'à la fin, sans fin d'étape connue
    expect(planSections([repeat(500, null), rows(1)], null).map((p) => [p.end, p.actionRows.length])).toEqual([
      [null, 4],
      [null, 0],
    ])
  })

  it('annonce ce qu’il y a à faire sur le rang à tricoter', () => {
    const step = { sections: SECTIONS, totalRows: 60 }
    expect(alertsAt(step, 1)).toEqual([])
    expect(alertsAt(step, 5)).toEqual([{ type: 'start', section: SECTIONS[1] }])
    expect(alertsAt(step, 10)).toEqual([{ type: 'action', section: SECTIONS[1], count: 1, times: 4 }])
    expect(alertsAt(step, 11)).toEqual([])
    expect(alertsAt(step, 28)).toEqual([{ type: 'action', section: SECTIONS[1], count: 4, times: 4 }])
    expect(alertsAt(step, 29)).toEqual([{ type: 'start', section: SECTIONS[2] }])
    expect(alertsAt(step, 46)).toEqual([{ type: 'action', section: SECTIONS[3], count: 1, times: null }])
    expect(alertsAt(step, 0)).toEqual([])
    // Répétition au premier rang de la section : les deux annonces
    expect(alertsAt({ sections: [rows(2), repeat(1, 2)], totalRows: null }, 3)).toEqual([
      { type: 'start', section: repeat(1, 2) },
      { type: 'action', section: repeat(1, 2), count: 1, times: 2 },
    ])
  })

  it('situe le rang à tricoter et la prochaine action', () => {
    const plan = planSections(SECTIONS, 60)
    expect(sectionIndexAt(plan, 1)).toBe(0)
    expect(sectionIndexAt(plan, 5)).toBe(1)
    expect(sectionIndexAt(plan, 38)).toBe(2)
    expect(sectionIndexAt(plan, 61)).toBeNull()
    expect(nextActionRow(plan[1]!, 10)).toBe(10)
    expect(nextActionRow(plan[1]!, 11)).toBe(16)
    expect(nextActionRow(plan[1]!, 29)).toBeNull()
  })

  it('décrit les sections', () => {
    expect(describeSection(rows(4, 'jersey'))).toBe('4 rangs : jersey')
    expect(describeSection(rows(1))).toBe('1 rang sans répétition')
    expect(describeSection(rows(null, '', '5 cm'))).toBe('5 cm (à régler) sans répétition')
    expect(describeSection(repeat(6, 4))).toBe('1 diminution — tous les 6 rangs (4 fois)')
    expect(describeSection(repeat(1, null))).toBe('1 diminution — à chaque rang')
    expect(describeSection(repeat(null, 3, '1 augmentation', 'tous les 5 cm'))).toBe('1 augmentation — tous les 5 cm (rangs à régler)')
    expect(describeRange({ section: rows(1), index: 0, start: 3, end: 3, actionRows: [] })).toBe('Rang 3')
  })
})

describe('formulaire d’une section', () => {
  it('lit des rangs sans répétition ou une répétition', () => {
    expect(formToSection({ kind: 'rows', text: ' jersey ', rows: '10', every: '', times: '' }, '5 cm')).toEqual(rows(10, 'jersey', '5 cm'))
    expect(formToSection({ kind: 'repeat', text: '1 diminution', rows: '', every: '6', times: '4' })).toEqual(repeat(6, 4))
    expect(formToSection({ kind: 'repeat', text: '1 diminution', rows: '', every: '', times: '' })).toEqual(repeat(null, null))
    expect(sectionToForm(repeat(6, 4))).toEqual({ kind: 'repeat', text: '1 diminution', rows: '', every: '6', times: '4' })
  })

  it('signale les valeurs invalides', () => {
    expect(formToSection({ kind: 'rows', text: '', rows: '0', every: '', times: '' })).toBe('Nombre de rangs : un nombre entier entre 1 et 2000.')
    expect(formToSection({ kind: 'rows', text: '', rows: '', every: '', times: '' })).toBe('Indique le nombre de rangs.')
    expect(formToSection({ kind: 'rows', text: '', rows: '', every: '', times: '' }, '5 cm')).toEqual(rows(null, '', '5 cm'))
    expect(formToSection({ kind: 'repeat', text: ' ', rows: '', every: '6', times: '' })).toContain('Indique quoi faire')
    expect(formToSection({ kind: 'repeat', text: 'x', rows: '', every: '2,5', times: '' })).toBe('Répétition : un nombre de rangs entre 1 et 500.')
    expect(formToSection({ kind: 'repeat', text: 'x', rows: '', every: '2', times: '0' })).toBe('Nombre de fois : un nombre entier à partir de 1.')
  })
})

describe('étape en cours', () => {
  it('est la première non terminée', () => {
    expect(currentStepIndex([{ done: true }, { done: false }, { done: false }])).toBe(1)
    expect(currentStepIndex([{ done: true }, { done: true }])).toBe(1)
    expect(currentStepIndex([])).toBe(0)
  })
})

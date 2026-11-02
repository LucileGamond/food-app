import {
  alertsAt,
  currentStepIndex,
  describeRange,
  describeSection,
  formToSection,
  nextActionRow,
  planSections,
  sectionIndexAt,
  sectionLines,
  sectionToForm,
  actionEffect,
  type SectionForm,
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
const decrease = { text: '1 diminution', rank: null }

describe('sections d’une étape', () => {
  it('enchaîne les rangs des sections', () => {
    const plan = planSections(SECTIONS, 60)
    expect(plan.map((p) => [p.start, p.end, p.actions.map((a) => a.row)])).toEqual([
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
    expect(planSections([repeat(500, null), rows(1)], null).map((p) => [p.end, p.actions.length > 0])).toEqual([
      [null, true],
      [null, false],
    ])
  })

  it('annonce ce qu’il y a à faire sur le rang à tricoter', () => {
    const step = { sections: SECTIONS, totalRows: 60 }
    expect(alertsAt(step, 1)).toEqual([])
    expect(alertsAt(step, 5)).toEqual([{ type: 'start', section: SECTIONS[1] }])
    expect(alertsAt(step, 10)).toEqual([{ type: 'action', section: SECTIONS[1], action: decrease, count: 1, times: 4 }])
    expect(alertsAt(step, 11)).toEqual([])
    expect(alertsAt(step, 28)).toEqual([{ type: 'action', section: SECTIONS[1], action: decrease, count: 4, times: 4 }])
    expect(alertsAt(step, 29)).toEqual([{ type: 'start', section: SECTIONS[2] }])
    expect(alertsAt(step, 46)).toEqual([{ type: 'action', section: SECTIONS[3], action: { text: '1 augmentation', rank: null }, count: 1, times: null }])
    expect(alertsAt(step, 0)).toEqual([])
    // Répétition au premier rang de la section : les deux annonces
    expect(alertsAt({ sections: [rows(2), repeat(1, 2)], totalRows: null }, 3)).toEqual([
      { type: 'start', section: repeat(1, 2) },
      { type: 'action', section: repeat(1, 2), action: decrease, count: 1, times: 2 },
    ])
  })

  it('place plusieurs actions sur leurs rangs de la répétition', () => {
    const raglan: StepSection = {
      ...repeat(4, 2),
      text: '',
      actions: [
        { text: '1 augmentation', rank: null },
        { text: '1 diminution', rank: 1 },
        { text: 'marqueur', rank: 9 },
      ],
    }
    const plan = planSections([rows(2), raglan], null)
    // Rang 9 au-delà d'une répétition de 4 : ramené au dernier rang
    expect(plan[1]!.actions.map((a) => [a.row, a.action.text, a.count])).toEqual([
      [3, '1 diminution', 1],
      [6, '1 augmentation', 1],
      [6, 'marqueur', 1],
      [7, '1 diminution', 2],
      [10, '1 augmentation', 2],
      [10, 'marqueur', 2],
    ])
    expect(alertsAt({ sections: [rows(2), raglan], totalRows: null }, 6).map((a) => a.type === 'action' && a.action.text)).toEqual(['1 augmentation', 'marqueur'])
    expect(describeSection(raglan)).toBe('1 augmentation (dernier rang) + 1 diminution (1er rang) + marqueur (dernier rang) — tous les 4 rangs (2 fois)')
    expect(describeSection({ ...raglan, actions: [{ text: 'torsade', rank: 2 }] })).toBe('torsade (rang 2) — tous les 4 rangs (2 fois)')
    const lines = sectionLines(plan[1]!, 3)
    expect(lines.map((l) => [l.rows, [...l.actions.keys()]])).toEqual([
      [[3, 4, 5, 6], [3, 6]],
      [[7, 8, 9, 10], [7, 10]],
    ])
    expect(lines[0]!.actions.get(6)!.map((a) => a.text)).toEqual(['1 augmentation', 'marqueur'])
  })

  it('dessine les pastilles des rangs et des répétitions', () => {
    const plan = planSections(SECTIONS, null)
    expect(sectionLines(plan[0]!, 1)).toEqual([{ rows: [1, 2, 3, 4], actions: new Map() }])
    expect(sectionLines(plan[1]!, 1).map((l) => l.rows.length)).toEqual([6, 6, 6, 6])
    // Répétition sans fin : jusqu'à deux fois après le rang à tricoter
    expect(sectionLines(plan[3]!, 40).map((l) => l.rows[0])).toEqual([39, 47, 55])
    expect(sectionLines(planSections([rows(null, '', '5 cm'), rows(2)], null)[1]!, 1)).toEqual([])
    expect(sectionLines(planSections([repeat(null, 2)], null)[0]!, 1)).toEqual([])
    expect(sectionLines(planSections([rows(null, '', '5 cm')], null)[0]!, 1)).toEqual([])
  })

  it('reconnaît les diminutions et les augmentations', () => {
    expect(actionEffect('1 diminution de chaque côté')).toBe('decrease')
    expect(actionEffect('2 m. ens. (dim)')).toBe('decrease')
    expect(actionEffect('Tricoter 2 m. ensemble')).toBe('decrease')
    expect(actionEffect('1 augmentation intercalaire')).toBe('increase')
    expect(actionEffect('aug de chaque côté')).toBe('increase')
    expect(actionEffect('placer un marqueur')).toBe('other')
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
    expect(describeRange({ section: rows(1), index: 0, start: 3, end: 3, repeatStarts: [], actions: [] })).toBe('Rang 3')
  })
})

describe('formulaire d’une section', () => {
  it('lit des rangs sans répétition ou une répétition', () => {
    const form = (patch: Partial<SectionForm>): SectionForm => ({ kind: 'repeat', text: '', rows: '', every: '', times: '', actions: [{ text: '1 diminution', rank: 'last' }], ...patch })
    expect(formToSection(form({ kind: 'rows', text: ' jersey ', rows: '10' }), '5 cm')).toEqual(rows(10, 'jersey', '5 cm'))
    expect(formToSection(form({ every: '6', times: '4' }))).toEqual({ ...repeat(6, 4), text: '', actions: [{ text: '1 diminution', rank: null }] })
    expect(formToSection(form({}))).toEqual({ ...repeat(null, null), text: '', actions: [{ text: '1 diminution', rank: null }] })
    // Plusieurs actions ; une action au dernier rang est enregistrée comme « dernier »
    expect(
      formToSection(form({ every: '4', actions: [{ text: ' 1 diminution ', rank: '1' }, { text: '1 augmentation', rank: '4' }, { text: ' ', rank: '2' }] })),
    ).toMatchObject({ actions: [{ text: '1 diminution', rank: 1 }, { text: '1 augmentation', rank: null }] })
    // Ancien format : l'action est le texte de la section
    expect(sectionToForm(repeat(6, 4))).toEqual({ kind: 'repeat', text: '', rows: '', every: '6', times: '4', actions: [{ text: '1 diminution', rank: 'last' }] })
    expect(sectionToForm(rows(4, 'jersey')).actions).toEqual([{ text: '', rank: 'last' }])
    expect(sectionToForm({ ...repeat(6, 4), actions: [{ text: 'torsade', rank: 2 }] }).actions).toEqual([{ text: 'torsade', rank: '2' }])
  })

  it('signale les valeurs invalides', () => {
    const form = (patch: Partial<SectionForm>): SectionForm => ({ kind: 'repeat', text: '', rows: '', every: '', times: '', actions: [{ text: 'x', rank: 'last' }], ...patch })
    expect(formToSection(form({ kind: 'rows', rows: '0' }))).toBe('Nombre de rangs : un nombre entier entre 1 et 2000.')
    expect(formToSection(form({ kind: 'rows' }))).toBe('Indique le nombre de rangs.')
    expect(formToSection(form({ kind: 'rows' }), '5 cm')).toEqual(rows(null, '', '5 cm'))
    expect(formToSection(form({ every: '6', actions: [{ text: ' ', rank: 'last' }] }))).toContain('Indique quoi faire')
    expect(formToSection(form({ every: '2,5' }))).toBe('Répétition : un nombre de rangs entre 1 et 500.')
    expect(formToSection(form({ every: '2', times: '0' }))).toBe('Nombre de fois : un nombre entier à partir de 1.')
    expect(formToSection(form({ every: '3', actions: [{ text: 'x', rank: '5' }] }))).toBe('Une action est placée après le dernier rang de la répétition (3).')
  })
})

describe('étape en cours', () => {
  it('est la première non terminée', () => {
    expect(currentStepIndex([{ done: true }, { done: false }, { done: false }])).toBe(1)
    expect(currentStepIndex([{ done: true }, { done: true }])).toBe(1)
    expect(currentStepIndex([])).toBe(0)
  })
})

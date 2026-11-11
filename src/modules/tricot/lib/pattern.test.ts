import {
  currentStepIndex,
  describeRange,
  describeSection,
  formToSection,
  nextActionRow,
  planSections,
  sectionIndexAt,
  sanitizeSections,
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
    expect(describeSection(raglan)).toBe('1 augmentation (dernier rang) + 1 diminution (1er rang) + marqueur (dernier rang) — tous les 4 rangs (2 fois)')
    expect(describeSection({ ...raglan, actions: [{ text: 'torsade', rank: 2 }] })).toBe('torsade (rang 2) — tous les 4 rangs (2 fois)')
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
    const form = (patch: Partial<SectionForm>): SectionForm => ({ kind: 'repeat', text: '', rows: '', every: '', times: '', actions: [{ text: '1 diminution', rank: 'last', stitches: '' }], ...patch })
    expect(formToSection(form({ kind: 'rows', text: ' jersey ', rows: '10' }), '5 cm')).toEqual(rows(10, 'jersey', '5 cm'))
    expect(formToSection(form({ every: '6', times: '4' }))).toEqual({ ...repeat(6, 4), text: '', actions: [{ text: '1 diminution', rank: null }] })
    expect(formToSection(form({}), 'tous les 5 cm')).toEqual({ ...repeat(null, null, '1 diminution', 'tous les 5 cm'), text: '', actions: [{ text: '1 diminution', rank: null }] })
    // Plusieurs actions ; une action au dernier rang est enregistrée comme « dernier »
    expect(
      formToSection(form({ every: '4', actions: [{ text: ' 1 diminution ', rank: '1', stitches: '' }, { text: '1 augmentation', rank: '4', stitches: '' }, { text: ' ', rank: '2', stitches: '' }] })),
    ).toMatchObject({ actions: [{ text: '1 diminution', rank: 1 }, { text: '1 augmentation', rank: null }] })
    // Ancien format : l'action est le texte de la section
    expect(sectionToForm(repeat(6, 4))).toEqual({ kind: 'repeat', text: '', rows: '', every: '6', times: '4', actions: [{ text: '1 diminution', rank: 'last', stitches: '' }] })
    expect(sectionToForm(rows(4, 'jersey')).actions).toEqual([{ text: '', rank: 'last', stitches: '' }])
    expect(sectionToForm({ ...repeat(6, 4), actions: [{ text: 'torsade', rank: 2 }] }).actions).toEqual([{ text: 'torsade', rank: '2', stitches: '' }])
  })

  it('signale les valeurs invalides', () => {
    const form = (patch: Partial<SectionForm>): SectionForm => ({ kind: 'repeat', text: '', rows: '', every: '', times: '', actions: [{ text: 'x', rank: 'last', stitches: '' }], ...patch })
    expect(formToSection(form({ kind: 'rows', rows: '0' }))).toBe('Nombre de rangs : un nombre entier entre 1 et 2000.')
    expect(formToSection(form({ kind: 'rows' }))).toBe('Indique le nombre de rangs.')
    expect(formToSection(form({ kind: 'rows' }), '5 cm')).toEqual(rows(null, '', '5 cm'))
    expect(formToSection(form({ every: '6', actions: [{ text: ' ', rank: 'last', stitches: '' }] }))).toContain('Indique quoi faire')
    expect(formToSection(form({ every: '2,5' }))).toBe('Répétition : un nombre de rangs entre 1 et 500.')
    expect(formToSection(form({ every: '2', times: '0' }))).toBe('Nombre de fois : un nombre entier entre 1 et 500.')
    // Sans nombre de rangs : seulement pour une mesure du patron à régler
    expect(formToSection(form({}))).toBe('Indique tous les combien de rangs.')
    expect(formToSection(form({}), 'tous les 5 cm')).toMatchObject({ every: null, pattern: 'tous les 5 cm' })
    expect(formToSection(form({ every: '3', actions: [{ text: 'x', rank: '5', stitches: '' }] }))).toBe('Une action est placée après le dernier rang de la répétition (3).')
  })
})

describe('sections lues en base', () => {
  it('garde seulement les sections bien formées', () => {
    expect(sanitizeSections(null)).toEqual([])
    expect(
      sanitizeSections([
        { kind: 'rows', rows: 4, text: 'jersey' },
        { kind: 'repeat', every: 6, times: 4.5, actions: [{ text: '1 dim', rank: 1 }, { text: ' ' }, 'x'], pattern: 'tous les 6 rangs' },
        { kind: 'autre' },
        'n’importe quoi',
        { kind: 'repeat', every: -2, text: 'ancien format' },
      ]),
    ).toEqual([
      { kind: 'rows', rows: 4, every: null, times: null, text: 'jersey', pattern: null },
      { kind: 'repeat', rows: null, every: 6, times: null, text: '', pattern: 'tous les 6 rangs', actions: [{ text: '1 dim', rank: 1 }] },
      { kind: 'repeat', rows: null, every: null, times: null, text: 'ancien format', pattern: null },
    ])
  })
})

describe('étape en cours', () => {
  it('est la première non terminée', () => {
    expect(currentStepIndex([{ done: true }, { done: false }, { done: false }])).toBe(1)
    expect(currentStepIndex([{ done: true }, { done: true }])).toBe(1)
    expect(currentStepIndex([])).toBe(0)
  })
})

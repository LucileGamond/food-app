// « En même temps » : un empiècement raglan inventé, construit comme celui d'un pull raglan de bas en haut
// (raglan du corps, raglan des manches, encolure qui commence pendant les deux).
import { describeEvent, stepGuide } from './guide'
import { convertSection, describeConversion, validateSection } from './measure'
import { stepOutline } from './outline'
import { describeSection, isToSet, planSections, sanitizeSections, sectionIndicesAt, type StepSection } from './pattern'
import { stitchTrack } from './stitches'

const repeat = (every: number, times: number, text: string, stitches: number, at?: StepSection['at']): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  actions: [{ text, rank: null, stitches }],
  text: '',
  pattern: null,
  ...(at ? { at } : {}),
})

// Corps : rangs 2 à 20 (10 fois), puis 21 et 22 ; manches : rangs 2 à 22 ; encolure : dès le rang 15.
const BODY = [repeat(2, 10, 'raglan corps', -4), repeat(1, 2, 'raglan corps', -4)]
const SLEEVES = [repeat(2, 11, 'raglan manches', -4, { row: 1, pattern: null })]
const NECK = [
  repeat(1, 1, '20 m centrales en attente', -20, { row: 15, pattern: null }),
  repeat(2, 2, 'encolure : rabattre 2 m de chaque côté', -4),
  repeat(2, 3, 'encolure : 1 m de chaque côté', -2),
]
const YOKE = { sections: [...BODY, ...SLEEVES, ...NECK], totalRows: 25, stitches: 66 }

const events = (row: number, step = YOKE) => stepGuide(step, [], 'Col').at(row).events.map(describeEvent)

describe('sections « en même temps »', () => {
  it('chaque consigne a sa piste : la section « en même temps » repart de son rang, les suivantes s’enchaînent derrière', () => {
    const plan = planSections(YOKE.sections, YOKE.totalRows)
    expect(plan.map((p) => [p.parallel, p.start, p.end])).toEqual([
      [false, 1, 20],
      [false, 21, 22],
      [true, 1, 22],
      [true, 15, 15],
      [false, 16, 19],
      [false, 20, 25],
    ])
    expect(plan[5]!.actions.map((a) => a.row)).toEqual([21, 23, 25])
    // Rang 21 : la fin du raglan du corps, celui des manches et l'encolure en même temps
    expect(sectionIndicesAt(plan, 21)).toEqual([1, 2, 5])
  })

  it('le rang annonce tout ce qui tombe dessus, de chaque consigne', () => {
    expect(events(15)).toEqual(['Nouvelle section : En même temps, dès le rang 15 : 20 m centrales en attente — à chaque rang (1 fois)', '20 m centrales en attente (1/1, dernière fois)'])
    expect(events(20)).toEqual(['raglan corps (10/10, dernière fois)', 'raglan manches (10/11)', 'Nouvelle section : encolure : 1 m de chaque côté — tous les 2 rangs (3 fois)'])
    expect(events(22)).toEqual(['raglan corps (2/2, dernière fois)', 'raglan manches (11/11, dernière fois)'])
    const guide = stepGuide(YOKE, [], 'Col')
    expect(guide.at(17).context).toBe(
      'raglan corps — tous les 2 rangs (10 fois) · En même temps, dès le rang 1 : raglan manches — tous les 2 rangs (11 fois) · encolure : rabattre 2 m de chaque côté — tous les 2 rangs (2 fois)',
    )
    // « Ensuite » mêle les pistes, dans l'ordre des rangs
    expect(guide.upcoming(18, 4).map((u) => u.row)).toEqual([19, 20, 21, 22])
  })

  it('les mailles comptent toutes les pistes', () => {
    // 66 à la fin ; corps −48, manches −44, encolure −34 : 192 au départ
    const track = stitchTrack(YOKE)
    expect(track(1)).toEqual({ kind: 'sure', stitches: 192 })
    expect(track(2)).toEqual({ kind: 'sure', stitches: 184 })
    // Rangs 2 à 14 : 7 rangs à 2 diminutions raglan (−8), puis l'encolure au rang 15
    expect(track(15)).toEqual({ kind: 'sure', stitches: 192 - 7 * 8 - 20 })
    expect(track(25)).toEqual({ kind: 'sure', stitches: 66 })
  })

  it('début à une hauteur (« à 5 cm ») : à régler, la suite n’est pas connue dès le 1er rang', () => {
    const toSet = { ...YOKE, sections: [...BODY, ...SLEEVES, { ...NECK[0]!, at: { row: null, pattern: '5 cm' } }, ...NECK.slice(1)] }
    expect(isToSet(toSet.sections[3]!)).toBe(true)
    expect(describeSection(toSet.sections[3]!)).toBe('En même temps, à 5 cm (à régler) : 20 m centrales en attente — à chaque rang (1 fois)')
    const guide = stepGuide(toSet, [], 'Col')
    expect(guide.at(1).events.map(describeEvent)).toContain('À régler avant de continuer : En même temps, à 5 cm (à régler) : 20 m centrales en attente — à chaque rang (1 fois)')
    expect(guide.at(2).unknown).toBe(true)
    expect(stitchTrack(toSet)(1)).toEqual({ kind: 'unknown', reason: 'Une section est à régler en rangs.' })
  })

  it('une section à régler sur la piste principale : les autres pistes restent annoncées jusque-là', () => {
    const sections = [repeat(2, 3, 'raglan corps', -4), { ...repeat(2, 3, 'raglan corps', -4), every: null, pattern: 'tous les 2 cm' }, repeat(1, 1, 'marqueur', 0, { row: 3, pattern: null })]
    const guide = stepGuide({ sections, totalRows: null }, [], null)
    expect(guide.at(3).events.map(describeEvent)).toEqual(['Nouvelle section : En même temps, dès le rang 3 : marqueur — à chaque rang (1 fois)', 'marqueur (1/1, dernière fois)'])
    expect(guide.at(7).events.map((e) => e.kind)).toEqual(['to-set'])
    expect(guide.upcoming(1, 10).map((u) => u.row)).toEqual([2, 3, 4, 6, 7])
  })

  it('début en cm converti avec l’échantillon, expliqué, puis validé', () => {
    const neck = { ...NECK[0]!, at: { row: null, pattern: '5 cm' } }
    // 5 cm × 30 rangs pour 10 cm = 15 rangs tricotés : début au rang 16
    const converted = convertSection(neck, { rowsPer10: 30, source: 'pattern' })
    expect(converted.at).toEqual({ row: 16, pattern: '5 cm', measured: { rowsPer10: 30, source: 'pattern' } })
    expect(describeSection(converted)).toBe('En même temps, dès le rang 16 (≈ 5 cm) : 20 m centrales en attente — à chaque rang (1 fois)')
    expect(describeConversion(converted)).toBe('début : 5 cm × 30 rangs pour 10 cm (échantillon du patron) ≈ rang 16')
    // Suit l'échantillon tant que ce n'est pas validé
    expect(convertSection(converted, { rowsPer10: 20, source: 'mine' }).at!.row).toBe(11)
    const validated = validateSection(converted)
    expect(validated.at).toEqual({ row: 16, pattern: '5 cm' })
    expect(convertSection(validated, { rowsPer10: 20, source: 'mine' })).toBe(validated)
    expect(describeSection(validated)).toBe('En même temps, dès le rang 16 : 20 m centrales en attente — à chaque rang (1 fois)')
  })

  it('l’étape entière liste les rangs de chaque consigne, et finit au dernier rang de la plus longue', () => {
    const outline = stepOutline(YOKE, 'Col')
    expect(outline.map((s) => [s.range, s.rows.map((r) => r.row).join(',')])).toEqual([
      ['Rangs 1 à 20', '2,4,6,8,10,12,14,16,18,20'],
      ['Rangs 21 à 22', '21,22'],
      ['Rangs 1 à 22', '2,4,6,8,10,12,14,16,18,20,22'],
      ['Rang 15', '15'],
      ['Rangs 16 à 19', '17,19'],
      ['Rangs 20 à 25', '21,23,25'],
    ])
  })

  it('le début est gardé en base s’il est bien formé', () => {
    const [kept, followed, invalid] = sanitizeSections([
      { ...NECK[0], at: { row: 15, pattern: '5 cm', measured: { rowsPer10: 30, source: 'mine' } } },
      { ...NECK[0], at: { row: null, pattern: null } },
      { ...NECK[0], at: { row: -1, pattern: 3 } },
    ])
    expect(kept!.at).toEqual({ row: 15, pattern: '5 cm', measured: { rowsPer10: 30, source: 'mine' } })
    expect(followed).not.toHaveProperty('at')
    expect(invalid).not.toHaveProperty('at')
  })
})

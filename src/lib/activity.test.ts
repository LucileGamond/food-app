import { activityLines, describeMealSlot, formatAgo, listNames, type ActivityEvent } from './activity'

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  kind: 'watered',
  actorId: 'eric',
  actorName: 'Eric',
  at: '2026-11-09T10:00:00',
  title: 'Ficus',
  detail: null,
  targetId: 'ficus',
  ...overrides,
})

const all = () => true
const TODAY = '2026-11-09'

describe('activité de l’autre', () => {
  it('énumère quelques noms, puis compte les autres', () => {
    expect(listNames(['Ficus'])).toBe('Ficus')
    expect(listNames(['Ficus', 'Monstera'])).toBe('Ficus et Monstera')
    expect(listNames(['A', 'B', 'C'])).toBe('A, B et 1 autre')
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B et 2 autres')
    expect(listNames(['A', 'B', 'C'], 3)).toBe('A, B et C')
  })

  it('décrit le moment d’un repas planifié', () => {
    expect(describeMealSlot('2026-11-09 LUNCH', TODAY)).toBe('aujourd’hui midi')
    expect(describeMealSlot('2026-11-10 DINNER', TODAY)).toBe('demain soir')
    expect(describeMealSlot('2026-11-08 DINNER', TODAY)).toBe('hier soir')
    expect(describeMealSlot('2026-11-12 LUNCH', TODAY)).toBe('jeudi 12 midi')
    expect(describeMealSlot('n’importe quoi', TODAY)).toBeNull()
    expect(describeMealSlot('2026-02-31 LUNCH', TODAY)).toBeNull()
    expect(describeMealSlot(null, TODAY)).toBeNull()
  })

  it('regroupe les gestes d’une personne, de même nature, le même jour', () => {
    const lines = activityLines(
      [
        event({ title: 'Ficus', at: '2026-11-09T08:00:00' }),
        event({ title: 'Monstera', targetId: 'monstera', at: '2026-11-09T08:01:00' }),
        event({ title: 'Cactus', targetId: 'cactus', at: '2026-11-08T08:00:00' }),
        event({ kind: 'shopping_added', title: 'Lait', detail: 'Courses', targetId: 'l1', at: '2026-11-09T09:00:00' }),
        event({ kind: 'shopping_added', title: 'Pain', detail: 'Courses', targetId: 'l1', at: '2026-11-09T09:05:00' }),
        event({ kind: 'shopping_added', title: 'Clous', detail: 'Bricolage', targetId: 'l2', at: '2026-11-09T09:06:00' }),
        event({ kind: 'shopping_checked', title: 'Œufs', detail: 'Courses', targetId: 'l1', at: '2026-11-09T09:07:00' }),
        event({ actorId: 'anne', actorName: 'Anne', title: 'Ficus', at: '2026-11-09T07:00:00' }),
      ],
      all,
      TODAY,
    )
    expect(lines.map((l) => `${l.actorName} ${l.text} → ${l.to}`)).toEqual([
      'Eric a coché Œufs dans Courses → /courses/l1',
      'Eric a ajouté Clous à Bricolage → /courses/l2',
      'Eric a ajouté 2 articles à Courses → /courses/l1',
      'Eric a arrosé Monstera et Ficus → /plantes',
      'Anne a arrosé Ficus → /plantes/ficus',
      'Eric a arrosé Cactus → /plantes/cactus',
    ])
    expect(lines[2]!.at).toBe('2026-11-09T09:05:00')
  })

  it('décrit chaque nature de geste', () => {
    const text = (events: Partial<ActivityEvent>[]) => activityLines(events.map(event), all, TODAY).map((l) => `${l.text} → ${l.to}`)
    expect(text([{ kind: 'plant_added', title: 'Ficus' }])).toEqual(['a ajouté la plante Ficus → /plantes/ficus'])
    expect(text([{ kind: 'plant_added', title: 'Ficus' }, { kind: 'plant_added', title: 'Cactus' }])).toEqual(['a ajouté 2 plantes → /plantes'])
    expect(text([{ kind: 'planned', title: 'Curry', detail: '2026-11-10 LUNCH', targetId: 'r1' }])).toEqual(['a planifié Curry (demain midi) → /planning'])
    expect(text([{ kind: 'planned', title: 'Curry', detail: 'inconnu' }])).toEqual(['a planifié Curry → /planning'])
    expect(text([{ kind: 'planned', title: 'Curry' }, { kind: 'planned', title: 'Curry' }])).toEqual(['a planifié 2 repas → /planning'])
    expect(text([{ kind: 'recipe_added', title: 'Tarte', targetId: 'r1' }])).toEqual(['a ajouté la recette Tarte → /recettes/r1'])
    expect(text([{ kind: 'recipe_added', title: 'Tarte' }, { kind: 'recipe_added', title: 'Flan' }])).toEqual(['a ajouté 2 recettes → /recettes'])
    expect(text([{ kind: 'shopping_checked', title: 'Lait', detail: 'Courses', targetId: 'l1' }, { kind: 'shopping_checked', title: 'Pain', detail: 'Courses', targetId: 'l1' }])).toEqual([
      'a coché 2 articles dans Courses → /courses/l1',
    ])
  })

  it('ne garde que les gestes des pages affichées', () => {
    const events = [event({}), event({ kind: 'recipe_added', title: 'Tarte' })]
    expect(activityLines(events, (page) => page !== 'plantes', TODAY).map((l) => l.text)).toEqual(['a ajouté la recette Tarte'])
  })

  it('dit depuis quand', () => {
    const now = new Date('2026-11-09T15:00:00')
    expect(formatAgo('2026-11-09T14:59:40', now)).toBe('à l’instant')
    expect(formatAgo('2026-11-09T14:35:00', now)).toBe('il y a 25 min')
    expect(formatAgo('2026-11-09T12:10:00', now)).toBe('il y a 2 h')
    expect(formatAgo('2026-11-09T08:05:00', now)).toBe('aujourd’hui à 08:05')
    expect(formatAgo('2026-11-08T18:30:00', now)).toBe('hier à 18:30')
    expect(formatAgo('2026-11-07T09:05:00', now)).toBe('samedi à 09:05')
  })
})

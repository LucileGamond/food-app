import { createHandler, type Deps } from './handler.ts'
import { buildUserMessage, MAX_DISHES, parseInput, sanitizePlan, type PlanInput } from './plan.ts'

const E = 'eric-id'
const L = 'lucile-id'

const INPUT: PlanInput = {
  start: '2026-11-09',
  people: [
    { id: E, name: 'Eric' },
    { id: L, name: 'Lucile' },
  ],
  slots: [
    { key: '2026-11-09|LUNCH', day: 'Lundi 9 novembre', slot: 'LUNCH', people: [E], freeCooks: [E] },
    { key: '2026-11-09|DINNER', day: 'Lundi 9 novembre', slot: 'DINNER', people: [E, L], freeCooks: [L] },
  ],
  dishes: [
    { id: 'd1', title: 'Lasagnes', minutes: 90, servings: 4, ingredients: ['pâtes', 'bœuf haché'], long: true, fragile: true },
    { id: 'd2', title: 'Soupe', minutes: null, servings: null, ingredients: [], long: false, fragile: false },
  ],
}

const reply = (input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'planifier_semaine', input }], usage: { input_tokens: 500, output_tokens: 200 } }), { status: 200 })

function deps(response: Response): Deps & { fetchModel: ReturnType<typeof vi.fn> } {
  return {
    apiKey: 'clé',
    fetchModel: vi.fn(async () => response),
    isSignedIn: async () => true,
    log: vi.fn(),
  }
}

const post = (body: unknown) => new Request('http://local/plan-week', { method: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(body) })

describe('parseInput', () => {
  it('valide et borne la demande', () => {
    const parsed = parseInput({
      ...INPUT,
      dishes: [{ ...INPUT.dishes[0], title: '  Lasagnes  ', ingredients: ['a', '', 'b'], minutes: -3, servings: 'x' }],
    })
    expect(parsed.dishes).toEqual([{ id: 'd1', title: 'Lasagnes', minutes: null, servings: null, ingredients: ['a', 'b'], long: true, fragile: true }])
    expect(parsed.slots).toEqual(INPUT.slots)
    expect(parsed.people).toEqual(INPUT.people)
  })

  it.each([
    [{ ...INPUT, start: 'demain' }, 'Date invalide.'],
    [{ ...INPUT, slots: [] }, 'Aucun créneau à remplir.'],
    [{ ...INPUT, dishes: [] }, 'Aucun plat à planifier.'],
    [{ ...INPUT, dishes: Array.from({ length: MAX_DISHES + 1 }, (_, i) => ({ id: `${i}`, title: 'x' })) }, '40 plats au plus.'],
    [{ ...INPUT, slots: [{ ...INPUT.slots[0], key: 'x' }] }, 'Créneau invalide.'],
    [{ ...INPUT, dishes: [{ id: 'd', title: ' ' }] }, 'Plat invalide.'],
  ])('refuse une demande invalide (%#)', (body, message) => {
    expect(() => parseInput(body)).toThrow(message)
  })
})

describe('buildUserMessage', () => {
  it('décrit personnes, créneaux et plats en lignes compactes', () => {
    expect(buildUserMessage(INPUT)).toBe(
      [
        'Début du cycle : 2026-11-09',
        'Personnes (id | prénom) :',
        `${E} | Eric`,
        `${L} | Lucile`,
        '',
        'Créneaux à remplir (créneau | jour | repas | à la maison | ont le temps de cuisiner) :',
        `2026-11-09|LUNCH | Lundi 9 novembre | midi | Eric | Eric`,
        `2026-11-09|DINNER | Lundi 9 novembre | soir | Eric, Lucile | Lucile`,
        '',
        'Plats à planifier (id | titre | minutes | portions | long | fragile | ingrédients) :',
        'd1 | Lasagnes | 90 | 4 | long | fragile | pâtes, bœuf haché',
        'd2 | Soupe | ? | ? |  |  | ',
      ].join('\n'),
    )
  })
})

describe('sanitizePlan', () => {
  it('garde les placements sur un créneau et un plat connus, un par créneau', () => {
    expect(
      sanitizePlan(
        {
          repas: [
            { creneau: '2026-11-09|DINNER', plat_id: 'd1', cuisinier_id: L, raison: ' Soirée libre ' },
            { creneau: '2026-11-09|DINNER', plat_id: 'd2', cuisinier_id: E, raison: 'doublon' },
            { creneau: '2026-11-09|LUNCH', plat_id: 'd1', cuisinier_id: null, raison: 'Restes' },
            { creneau: '2026-11-10|LUNCH', plat_id: 'd2', cuisinier_id: E, raison: 'inconnu' },
            { creneau: '2026-11-09|LUNCH', plat_id: 'zz', cuisinier_id: E, raison: '' },
            'n’importe quoi',
          ],
        },
        INPUT,
      ),
    ).toEqual([
      { slot: '2026-11-09|DINNER', dishId: 'd1', cookId: L, why: 'Soirée libre' },
      { slot: '2026-11-09|LUNCH', dishId: 'd1', cookId: null, why: 'Restes' },
    ])
    expect(sanitizePlan(null, INPUT)).toEqual([])
    // Cuisinier inconnu : laissé à l'application (pas pris pour des restes).
    expect(sanitizePlan({ repas: [{ creneau: '2026-11-09|DINNER', plat_id: 'd1', cuisinier_id: 'qui ?', raison: '' }] }, INPUT)).toEqual([
      { slot: '2026-11-09|DINNER', dishId: 'd1', why: '' },
    ])
  })
})

describe('handler', () => {
  it('renvoie les repas proposés par le modèle', async () => {
    const d = deps(reply({ repas: [{ creneau: '2026-11-09|DINNER', plat_id: 'd2', cuisinier_id: L, raison: 'Rapide' }] }))
    const response = await createHandler(d)(post(INPUT))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ meals: [{ slot: '2026-11-09|DINNER', dishId: 'd2', cookId: L, why: 'Rapide' }] })
    const body = JSON.parse(String(d.fetchModel.mock.calls[0]![1]!.body))
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'planifier_semaine' })
    expect(body.system).toContain('midi et soir')
    expect(d.log).toHaveBeenCalledWith('semaine planifiée', expect.objectContaining({ slots: 2, dishes: 2, meals: 1 }))
  })

  it('refuse une demande invalide', async () => {
    const response = await createHandler(deps(reply({})))(post({ ...INPUT, dishes: [] }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Aucun plat à planifier.' })
  })
})

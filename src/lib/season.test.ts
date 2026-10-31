import { findProduce, monthOf, produceList, produceOfMonth, recipeSeason } from './season'
import { SEASON_CALENDAR } from './seasonCalendar'

describe('fruits et légumes des ingrédients', () => {
  it.each([
    ['Tomates', 'tomate'],
    ['tomates cerises', 'tomate'],
    ['Courgettes jaunes', 'courgette'],
    ['chou-fleur', 'choufleur'],
    ['choux de Bruxelles', 'choudebruxelles'],
    ['chou rouge', 'chou'],
    ['petits pois frais', 'petitpois'],
    ['haricots verts', 'haricotvert'],
    ['pommes golden', 'pomme'],
    ['épinards', 'epinard'],
    ['céleri-rave', 'celeri'],
    ['courge butternut', 'courge'],
    ['potimarron', 'courge'],
    ['salade verte', 'laitue'],
    ['blettes', 'blette'],
    ['reines-claudes', 'reineclaude'],
    ['mirabelles', 'prune'],
    ['zeste d’orange', 'orange'],
  ])('« %s » → %s', (name, slug) => {
    expect(findProduce(name)?.slug).toBe(slug)
  })

  it.each([
    'pommes de terre',
    'patate douce',
    'tomates pelées',
    'concentré de tomate',
    'petits pois surgelés',
    'raisins secs',
    'jus d’orange',
    'compote de pommes',
    'oignon',
    'ail',
    'jus de citron',
    'poivre',
    'farine',
    'noix de coco râpée',
    'eau de fleur d’oranger',
  ])('« %s » n’est pas suivi', (name) => {
    expect(findProduce(name)).toBeNull()
  })

  it('distingue poire et poireau', () => {
    expect(findProduce('poireaux')?.slug).toBe('poireau')
    expect(findProduce('poires')?.slug).toBe('poire')
  })
})

describe('saison d’une recette', () => {
  it('de saison, hors saison, ou rien à suivre', () => {
    expect(recipeSeason(['potiron', 'poireaux', 'crème', 'oignon'], 11)).toMatchObject({ status: 'in', outOfSeason: [] })
    const ratatouille = recipeSeason(['tomates', 'courgettes', 'aubergine', 'Tomates cerises', 'ail'], 11)
    expect(ratatouille.status).toBe('out')
    expect(ratatouille.produce.map((p) => p.slug)).toEqual(['tomate', 'courgette', 'aubergine'])
    expect(produceList(ratatouille.outOfSeason)).toBe('tomate, courgette, aubergine')
    expect(recipeSeason(['tomates', 'courgettes'], 7).status).toBe('in')
    expect(recipeSeason(['pâtes', 'lardons', 'crème'], 11)).toEqual({ status: 'none', produce: [], outOfSeason: [] })
  })

  it('fruits et légumes du mois', () => {
    const november = produceOfMonth(11).map((p) => p.slug)
    expect(november).toContain('poireau')
    expect(november).toContain('clementine')
    expect(november).not.toContain('tomate')
    expect(produceOfMonth(7).map((p) => p.name)).toContain('Tomate')
    expect(monthOf('2026-11-05')).toBe(11)
  })

  it('le calendrier est complet et cohérent', () => {
    expect(SEASON_CALENDAR.length).toBeGreaterThan(50)
    for (const p of SEASON_CALENDAR) {
      expect(p.months.length).toBeGreaterThan(0)
      expect(p.months.length).toBeLessThan(12)
      expect(p.months.every((m) => m >= 1 && m <= 12)).toBe(true)
      // Chaque produit est reconnu par son propre nom.
      expect(findProduce(p.name)?.slug).toBe(p.slug)
    }
  })
})

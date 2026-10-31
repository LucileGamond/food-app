import { filterSources, findSource, groupSources } from './sources'

describe('groupSources', () => {
  it('regroupe les écritures d’une même source sous la plus utilisée, triées par nom', () => {
    expect(
      groupSources(['Pâtisserie maison', ' patisserie  maison', 'Pâtisserie maison', 'Ottolenghi', 'PATISSERIE MAISON', 'Basique', '  ']),
    ).toEqual(['Basique', 'Ottolenghi', 'Pâtisserie maison'])
  })

  it('à égalité, préfère l’écriture avec majuscules', () => {
    expect(groupSources(['ottolenghi', 'Ottolenghi'])).toEqual(['Ottolenghi'])
  })
})

describe('findSource', () => {
  const sources = ['Pâtisserie maison', 'Ottolenghi']

  it('retrouve la source à la casse, aux accents et aux espaces près', () => {
    expect(findSource('  patisserie   MAISON ', sources)).toBe('Pâtisserie maison')
  })

  it('renvoie null pour une nouvelle source ou un texte vide', () => {
    expect(findSource('Pâtisserie', sources)).toBeNull()
    expect(findSource('  ', sources)).toBeNull()
  })
})

describe('filterSources', () => {
  it('garde les sources qui contiennent la saisie, toutes sans saisie', () => {
    const sources = ['Pâtisserie maison', 'Ottolenghi', 'Simple']
    expect(filterSources('pati', sources)).toEqual(['Pâtisserie maison'])
    expect(filterSources('', sources)).toEqual(sources)
  })
})

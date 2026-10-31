import { filterSources, findSource, groupSources, recipeKey } from './sources'

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

describe('recipeKey', () => {
  it('même titre et même livre (casse, accents, espaces près) : même recette', () => {
    expect(recipeKey(' Tarte au Citron', 'patisserie  maison')).toBe(recipeKey('tarte au citron', 'Pâtisserie maison'))
    expect(recipeKey('Tarte', null)).toBe(recipeKey('tarte', '  '))
  })

  it('autre livre, ou sans livre : autre recette', () => {
    expect(recipeKey('Tarte', 'Ottolenghi')).not.toBe(recipeKey('Tarte', 'Pâtisserie maison'))
    expect(recipeKey('Tarte', 'Ottolenghi')).not.toBe(recipeKey('Tarte', null))
  })
})

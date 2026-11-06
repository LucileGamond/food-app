import { fakeApi } from '@/test/fakes'
import { AppError } from '@/api'
import { applyAutoLinks } from '@/services/autoLinks'
import { findAutoLinks, type LinkableRecipe } from './autoLinks'

const ing = (position: number, name: string, note: string | null = null, linkedRecipeId: string | null = null) => ({ position, name, note, linkedRecipeId })
const recipe = (id: string, title: string, source: string | null, sourcePage: string | null, ingredients: LinkableRecipe['ingredients'] = []): LinkableRecipe => ({
  id,
  title,
  source,
  sourcePage,
  ingredients,
})

const TARTE = recipe('tarte', 'Tarte au citron', 'Pâtisserie maison', '146', [ing(0, 'pâte sucrée', 'voir p. 208'), ing(1, 'citrons', null)])
const PATE = recipe('pate', 'Pâte sucrée', 'patisserie MAISON', '208')

describe('findAutoLinks', () => {
  it('lie le renvoi à la recette du même livre imprimée à cette page', () => {
    expect(findAutoLinks([TARTE, PATE])).toEqual([
      { recipeId: 'tarte', recipeTitle: 'Tarte au citron', position: 0, name: 'pâte sucrée', linkedId: 'pate', linkedTitle: 'Pâte sucrée' },
    ])
  })

  it('renvoi dans le nom, page dans une plage', () => {
    const quiche = recipe('q', 'Quiche', 'Pâtisserie maison', '50', [ing(0, 'pâte brisée (page 211)')])
    const brisee = recipe('b', 'Pâte brisée', 'Pâtisserie maison', '210-211')
    expect(findAutoLinks([quiche, brisee]).map((l) => l.linkedId)).toEqual(['b'])
  })

  it('ni autre livre, ni recette sans livre, ni ingrédient déjà lié, ni elle-même', () => {
    const autreLivre = recipe('x', 'Pâte sucrée', 'Ottolenghi', '208')
    expect(findAutoLinks([TARTE, autreLivre])).toEqual([])
    expect(findAutoLinks([{ ...TARTE, source: null }, PATE])).toEqual([])
    expect(findAutoLinks([{ ...TARTE, ingredients: [ing(0, 'pâte sucrée', 'voir p. 208', 'autre')] }, PATE])).toEqual([])
    expect(findAutoLinks([{ ...TARTE, sourcePage: '208' }])).toEqual([])
  })

  it('plusieurs recettes sur la page : celle dont le titre correspond, sinon aucune', () => {
    const creme = recipe('creme', 'Crème pâtissière', 'Pâtisserie maison', '208')
    expect(findAutoLinks([TARTE, PATE, creme]).map((l) => l.linkedId)).toEqual(['pate'])
    const autre = recipe('autre', 'Sablés', 'Pâtisserie maison', '208')
    expect(findAutoLinks([TARTE, creme, autre])).toEqual([])
  })

  it('avec une recette donnée : ses renvois et ceux des autres vers elle', () => {
    const flan = recipe('flan', 'Flan', 'Pâtisserie maison', '90', [ing(0, 'pâte brisée', 'p. 210')])
    const brisee = recipe('b', 'Pâte brisée', 'Pâtisserie maison', '210')
    const all = [TARTE, PATE, flan, brisee]
    expect(findAutoLinks(all, 'pate').map((l) => l.recipeId)).toEqual(['tarte'])
    expect(findAutoLinks(all, 'flan').map((l) => l.linkedId)).toEqual(['b'])
    expect(findAutoLinks(all)).toHaveLength(2)
  })
})

describe('applyAutoLinks', () => {
  it('enregistre chaque lien, et continue après un échec', async () => {
    const api = fakeApi()
    const brisee = recipe('b', 'Pâte brisée', 'Pâtisserie maison', '210')
    const flan = recipe('flan', 'Flan', 'Pâtisserie maison', '90', [ing(0, 'pâte brisée', 'p. 210')])
    api.recipes.listLinkable.mockResolvedValue([TARTE, PATE, flan, brisee])
    api.recipes.linkIngredient.mockRejectedValueOnce(new AppError('modifiée')).mockResolvedValue(undefined)
    const result = await applyAutoLinks(api)
    expect(api.recipes.linkIngredient).toHaveBeenCalledWith('tarte', { position: 0, name: 'pâte sucrée' }, 'pate')
    expect(api.recipes.linkIngredient).toHaveBeenCalledWith('flan', { position: 0, name: 'pâte brisée' }, 'b')
    expect(result.failed).toBe(1)
    expect(result.linked.map((l) => l.recipeId)).toEqual(['flan'])
  })
})

import { importChecks, pendingChecks } from './importChecks'
import { importedToFormValues, type ImportedRecipe } from './recipes'

const RECIPE: ImportedRecipe = {
  title: 'Tarte à la banane et au café',
  servings: null,
  ingredients: [
    { name: 'pâte sucrée', quantity: 200, unit: 'g', note: 'voir p. 208' },
    { name: 'bananes mûres', quantity: 5, unit: null, note: null },
    { name: 'citron jaune', quantity: null, unit: null, note: 'le jus d’1/2' },
    { name: 'thym-citron', quantity: null, unit: null, note: null },
    { name: 'fleur de sel', quantity: null, unit: null, note: null },
  ],
  steps: '',
  tags: [],
  checks: [
    { ingredient: 1, message: 'Quantité approximative (4 ou 5)' },
    { ingredient: null, message: 'Sous-parties du livre regroupées' },
    { ingredient: 1, message: 'Quantité approximative (4 ou 5)' },
  ],
}

describe('importChecks', () => {
  it('réunit les points du modèle et les contrôles de l’application', () => {
    const values = importedToFormValues(RECIPE, '')
    const [pate, bananes, citron, thym] = values.ingredients
    expect(importChecks(RECIPE, values).map((c) => [c.ingredientKey, c.field, c.message])).toEqual([
      [bananes!.key, null, 'Quantité approximative (4 ou 5)'],
      [null, null, 'Sous-parties du livre regroupées'],
      [pate!.key, null, 'Renvoie à une autre page : recette à importer après l’enregistrement'],
      [citron!.key, null, 'Quantité dans la précision : à reporter si possible'],
      [thym!.key, null, 'Quantité non trouvée'],
      [null, 'servings', 'Nombre de portions non trouvé'],
      [null, 'notes', 'Étapes de préparation non trouvées'],
    ])
  })

  it('ne signale rien pour une recette complète, même sans points du modèle', () => {
    const values = importedToFormValues({ ...RECIPE, servings: 6, steps: '1. Cuire.', ingredients: [RECIPE.ingredients[1]!], checks: undefined }, '')
    expect(importChecks({}, values)).toEqual([])
  })

  it('retire un point dès que la ligne ou le champ est corrigé', () => {
    const snapshot = importedToFormValues(RECIPE, '')
    const checks = importChecks(RECIPE, snapshot)
    const thym = snapshot.ingredients[3]!
    const fixed = {
      ...snapshot,
      servings: '6',
      ingredients: snapshot.ingredients.map((r) => (r.key === thym.key ? { ...r, quantity: '1', unit: 'brin' } : r)).filter((r) => r.name !== 'pâte sucrée'),
    }
    const left = pendingChecks(checks, snapshot, fixed).map((c) => c.message)
    expect(left).not.toContain('Quantité non trouvée')
    expect(left).not.toContain('Nombre de portions non trouvé')
    expect(left).not.toContain('Renvoie à une autre page : recette à importer après l’enregistrement')
    expect(left).toContain('Sous-parties du livre regroupées')
    expect(left).toContain('Étapes de préparation non trouvées')
  })
})

import {
  formHasContent,
  importedImageToFile,
  importedToFormValues,
  siteName,
  collectTags,
  filledIngredients,
  filterRecipes,
  formatIngredient,
  formatQuantity,
  hasErrors,
  moveItem,
  newIngredientDraft,
  normalizeTags,
  parseQuantity,
  photoPath,
  recipeToFormValues,
  toSaveRecipeInput,
  validateRecipeForm,
  type RecipeFormValues,
} from './recipes'

function form(overrides: Partial<RecipeFormValues> = {}): RecipeFormValues {
  return {
    title: 'Curry',
    servings: '4',
    notes: '',
    url: '',
    tags: [],
    ingredients: [{ key: 'k1', name: 'Pois chiches', quantity: '400', unit: 'g' }],
    ...overrides,
  }
}

describe('quantités', () => {
  it('parse les formats français et anglais', () => {
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity(' 2 ')).toBe(2)
    expect(parseQuantity('0.25')).toBe(0.25)
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('beaucoup')).toBeNaN()
    expect(parseQuantity('-1')).toBeNaN()
  })
  it('formate les quantités et les ingrédients', () => {
    expect(formatQuantity(null)).toBe('')
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatIngredient({ name: 'farine', quantity: 200, unit: 'g' })).toBe('200 g farine')
    expect(formatIngredient({ name: 'œufs', quantity: 3, unit: null })).toBe('3 œufs')
    expect(formatIngredient({ name: 'sel', quantity: null, unit: null })).toBe('sel')
  })
})

describe('normalizeTags', () => {
  it('nettoie, ignore les vides et dédoublonne sans tenir compte de la casse', () => {
    expect(normalizeTags([' Végé ', 'végé', '', 'rapide  été', 'Rapide été'])).toEqual(['Végé', 'rapide été'])
  })
})

describe('validateRecipeForm', () => {
  it('accepte une recette complète', () => {
    expect(validateRecipeForm(form())).toEqual({})
    expect(hasErrors(validateRecipeForm(form()))).toBe(false)
  })
  it('exige un titre', () => {
    expect(validateRecipeForm(form({ title: ' ' })).title).toBeDefined()
  })
  it('exige au moins un ingrédient, en ignorant les lignes vides', () => {
    const errors = validateRecipeForm(form({ ingredients: [{ key: 'k', name: ' ', quantity: '', unit: '' }] }))
    expect(errors.ingredients).toBeDefined()
    expect(hasErrors(errors)).toBe(true)
  })
  it('signale les lignes incomplètes ou les quantités invalides', () => {
    const errors = validateRecipeForm(form({
      ingredients: [
        { key: 'a', name: '', quantity: '2', unit: '' },
        { key: 'b', name: 'Sel', quantity: 'xx', unit: '' },
        { key: 'c', name: 'Riz', quantity: '0', unit: 'g' },
        { key: 'd', name: 'Eau', quantity: '', unit: '' },
      ],
    }))
    expect(errors.ingredientRows).toEqual({ a: 'Nom manquant', b: 'Quantité invalide', c: 'Quantité invalide' })
    expect(errors.ingredients).toBeUndefined()
  })
  it('valide les portions et le lien', () => {
    expect(validateRecipeForm(form({ servings: '0' })).servings).toBeDefined()
    expect(validateRecipeForm(form({ servings: '2.5' })).servings).toBeDefined()
    expect(validateRecipeForm(form({ servings: '' })).servings).toBeUndefined()
    expect(validateRecipeForm(form({ url: 'exemple.fr' })).url).toBeDefined()
    expect(validateRecipeForm(form({ url: 'https://exemple.fr' })).url).toBeUndefined()
  })
})

describe('conversion formulaire ↔ données', () => {
  it('prépare les données à enregistrer', () => {
    expect(toSaveRecipeInput('r1', form({
      title: ' Curry ', servings: '', notes: '  ', url: ' https://a.fr ', tags: ['végé', 'Végé'],
      ingredients: [
        { key: 'a', name: ' Riz ', quantity: '1,5', unit: ' kg ' },
        { key: 'b', name: 'Sel', quantity: '', unit: '' },
        { key: 'c', name: '', quantity: '', unit: '' },
      ],
    }))).toEqual({
      id: 'r1', title: 'Curry', notes: null, url: 'https://a.fr', servings: null, tags: ['végé'],
      ingredients: [{ name: 'Riz', quantity: 1.5, unit: 'kg' }, { name: 'Sel', quantity: null, unit: null }],
    })
    expect(toSaveRecipeInput(null, form()).servings).toBe(4)
  })

  it('préremplit le formulaire depuis une recette, avec au moins une ligne d’ingrédient', () => {
    const values = recipeToFormValues({ title: 'Pâtes', servings: null, notes: null, url: null, tags: ['x'] })
    expect(values).toMatchObject({ title: 'Pâtes', servings: '', notes: '', url: '', tags: ['x'] })
    expect(values.ingredients).toHaveLength(1)
    expect(values.ingredients[0]?.name).toBe('')

    const full = recipeToFormValues({
      title: 'Curry', servings: 2, notes: 'n', url: 'https://a.fr', tags: [],
      ingredients: [{ name: 'Riz', quantity: 0.5, unit: 'kg' }],
    })
    expect(full.servings).toBe('2')
    expect(full.ingredients[0]).toMatchObject({ name: 'Riz', quantity: '0,5', unit: 'kg' })
  })

  it('génère des clés uniques pour les lignes', () => {
    expect(newIngredientDraft().key).not.toBe(newIngredientDraft().key)
  })

  it('filtre les lignes vides', () => {
    expect(filledIngredients([
      { key: 'a', name: '', quantity: '', unit: '' },
      { key: 'b', name: '', quantity: '', unit: 'g' },
    ]).map((r) => r.key)).toEqual(['b'])
  })
})

describe('moveItem', () => {
  it('déplace un élément et ignore les index hors limites', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b'])
  })
})

describe('recherche', () => {
  const recipes = [
    { title: 'Crème brûlée', tags: ['Dessert'], ingredientNames: ['œufs', 'crème'] },
    { title: 'Curry de légumes', tags: ['végé', 'rapide'], ingredientNames: ['Pois chiches', 'Lait de coco'] },
    { title: 'Pâtes pesto', tags: ['Rapide'], ingredientNames: ['Basilic'] },
  ]

  it('cherche sans accents ni casse dans le titre et les ingrédients', () => {
    expect(filterRecipes(recipes, 'CREME', null).map((r) => r.title)).toEqual(['Crème brûlée'])
    expect(filterRecipes(recipes, 'pois', null).map((r) => r.title)).toEqual(['Curry de légumes'])
    expect(filterRecipes(recipes, '  ', null)).toHaveLength(3)
  })
  it('filtre par tag, combiné à la recherche', () => {
    expect(filterRecipes(recipes, '', 'rapide').map((r) => r.title)).toEqual(['Curry de légumes', 'Pâtes pesto'])
    expect(filterRecipes(recipes, 'pesto', 'rapide').map((r) => r.title)).toEqual(['Pâtes pesto'])
    expect(filterRecipes(recipes, '', 'inconnu')).toEqual([])
  })
  it('liste les tags distincts triés', () => {
    expect(collectTags(recipes)).toEqual(['Dessert', 'rapide', 'végé'])
  })
})

describe('photoPath', () => {
  it('range les photos par recette', () => {
    expect(photoPath('r1', 'f1')).toBe('r1/f1.jpg')
    expect(photoPath('r1', 'f1', 'webp')).toBe('r1/f1.webp')
  })
})

describe('import depuis un lien', () => {
  const imported = {
    title: 'Crêpes',
    servings: 4,
    ingredients: [{ name: 'farine', quantity: 250, unit: 'g' }],
    steps: '1. Mélanger.',
    tags: ['Dessert', 'dessert ', 'rapide'],
  }

  it('convertit la recette importée en valeurs de formulaire', () => {
    const values = importedToFormValues(imported, 'https://exemple.fr/crepes')
    expect(values).toMatchObject({ title: 'Crêpes', servings: '4', notes: '1. Mélanger.', url: 'https://exemple.fr/crepes', tags: ['Dessert', 'rapide'] })
    expect(values.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([{ name: 'farine', quantity: '250', unit: 'g' }])
    const empty = importedToFormValues({ ...imported, servings: null, steps: '', ingredients: [] }, 'https://e.fr')
    expect(empty).toMatchObject({ servings: '', notes: '' })
    expect(empty.ingredients).toHaveLength(1)
  })

  it('détecte une saisie que l’import remplacerait', () => {
    const blank = importedToFormValues({ ...imported, steps: '', tags: [], ingredients: [] }, '')
    expect(formHasContent({ ...blank, title: 'Titre', url: 'https://e.fr' })).toBe(false)
    expect(formHasContent({ ...blank, notes: ' x ' })).toBe(true)
    expect(formHasContent({ ...blank, tags: ['a'] })).toBe(true)
    expect(formHasContent(importedToFormValues(imported, ''))).toBe(true)
  })

  it('transforme la photo importée en fichier', async () => {
    const file = importedImageToFile({ data: btoa('abc'), type: 'image/png' })
    expect(file.name).toBe('photo-importee.png')
    expect(file.type).toBe('image/png')
    expect(await file.text()).toBe('abc')
    expect(importedImageToFile({ data: '', type: 'image/webp' }).name).toBe('photo-importee.webp')
    expect(importedImageToFile({ data: '', type: 'image/jpeg' }, 'x').name).toBe('x.jpg')
  })

  it('donne le nom du site', () => {
    expect(siteName('https://www.marmiton.org/recettes/a')).toBe('marmiton.org')
    expect(siteName('pas une url')).toBe('pas une url')
  })
})

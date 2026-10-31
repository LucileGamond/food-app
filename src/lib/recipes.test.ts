import {
  normalizeIngredientUnit,
  roundQuantity,
  scaleIngredients,
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
  formatDuration,
  groupBySection,
  linkedImportPath,
  linkedSource,
  formatNutrition,
  formatSource,
  splitSource,
  linkedTitle,
  pageReference,
  parseLinkedImport,
  pendingLinks,
  parseDuration,
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
    source: '',
    page: '',
    nutritionPer: 'portion',
    kcal: '',
    carbs: '',
    protein: '',
    fat: '',
    prepTime: '',
    restTime: '',
    cookTime: '',
    tags: [],
    ingredients: [{ key: 'k1', name: 'Pois chiches', quantity: '400', unit: 'g', note: '' }],
    ...overrides,
  }
}

describe('quantités', () => {
  it('parse les formats français et anglais', () => {
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity(' 2 ')).toBe(2)
    // Valeur réaffichée dans un formulaire : « 1 500 » (espace fine insécable)
    expect(parseQuantity(formatQuantity(1500))).toBe(1500)
    expect(parseQuantity('1 250,5')).toBe(1250.5)
    expect(parseQuantity('0.25')).toBe(0.25)
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('beaucoup')).toBeNaN()
    expect(parseQuantity('-1')).toBeNaN()
  })
  it('formate les quantités et les ingrédients', () => {
    expect(formatQuantity(null)).toBe('')
    expect(formatQuantity(1.5)).toBe('1,5')
    expect(formatIngredient({ name: 'farine', quantity: 200, unit: 'g', note: null })).toBe('200 g farine')
    expect(formatIngredient({ name: 'œufs', quantity: 3, unit: null, note: null })).toBe('3 œufs')
    expect(formatIngredient({ name: 'sel', quantity: null, unit: null, note: null })).toBe('sel')
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
    const errors = validateRecipeForm(form({ ingredients: [{ key: 'k', name: ' ', quantity: '', unit: '', note: '' }] }))
    expect(errors.ingredients).toBeDefined()
    expect(hasErrors(errors)).toBe(true)
  })
  it('signale les lignes incomplètes ou les quantités invalides', () => {
    const errors = validateRecipeForm(form({
      ingredients: [
        { key: 'a', name: '', quantity: '2', unit: '', note: '' },
        { key: 'b', name: 'Sel', quantity: 'xx', unit: '', note: '' },
        { key: 'c', name: 'Riz', quantity: '0', unit: 'g', note: '' },
        { key: 'd', name: 'Eau', quantity: '', unit: '', note: '' },
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
        { key: 'a', name: ' Riz ', quantity: '1,5', unit: ' kg ', note: '' },
        { key: 'b', name: 'Sel', quantity: '', unit: '', note: '' },
        { key: 'c', name: '', quantity: '', unit: '', note: '' },
      ],
    }))).toEqual({
      id: 'r1', title: 'Curry', notes: null, url: 'https://a.fr', servings: null, tags: ['végé'],
      source: null, sourcePage: null, nutrition: null, prepMinutes: null, restMinutes: null, cookMinutes: null,
      ingredients: [
        { name: 'Riz', quantity: 1.5, unit: 'kg', note: null, section: null },
        { name: 'Sel', quantity: null, unit: null, note: null, section: null },
      ],
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
      ingredients: [{ name: 'Riz', quantity: 0.5, unit: 'kg', note: null }],
    })
    expect(full.servings).toBe('2')
    expect(full.ingredients[0]).toMatchObject({ name: 'Riz', quantity: '0,5', unit: 'kg', note: '' })
  })

  it('génère des clés uniques pour les lignes', () => {
    expect(newIngredientDraft().key).not.toBe(newIngredientDraft().key)
  })

  it('filtre les lignes vides', () => {
    expect(filledIngredients([
      { key: 'a', name: '', quantity: '', unit: '', note: '' },
      { key: 'b', name: '', quantity: '', unit: 'g', note: '' },
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
    ingredients: [{ name: 'farine', quantity: 250, unit: 'g', note: null }],
    steps: '1. Mélanger.',
    tags: ['Dessert', 'dessert ', 'rapide'],
  }

  it('convertit la recette importée en valeurs de formulaire', () => {
    const values = importedToFormValues(imported, 'https://exemple.fr/crepes')
    expect(values).toMatchObject({ title: 'Crêpes', servings: '4', notes: '1. Mélanger.', url: 'https://exemple.fr/crepes', tags: ['Dessert', 'rapide'] })
    expect(values.ingredients.map(({ name, quantity, unit, note }) => ({ name, quantity, unit, note }))).toEqual([{ name: 'farine', quantity: '250', unit: 'g', note: '' }])
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

describe('adaptation des quantités', () => {
  it('arrondit de façon lisible', () => {
    expect(roundQuantity(1.33333)).toBe(1.33)
    expect(roundQuantity(16.666)).toBe(16.7)
    expect(roundQuantity(133.3)).toBe(133)
  })

  it('recalcule pour un autre nombre de personnes', () => {
    const ingredients = [
      { name: 'farine', quantity: 250, unit: 'g', note: null },
      { name: 'sel', quantity: null, unit: null, note: null },
    ]
    expect(scaleIngredients(ingredients, 4, 6)).toEqual([
      { name: 'farine', quantity: 375, unit: 'g', note: null },
      { name: 'sel', quantity: null, unit: null, note: null },
    ])
    const same = scaleIngredients(ingredients, 4, 4)
    expect(same).toEqual(ingredients)
    expect(same[0]).not.toBe(ingredients[0])
    expect(scaleIngredients(ingredients, 0, 2)).toEqual(ingredients)
  })
})

describe('unités et précisions des ingrédients', () => {
  it('affiche l’unité accordée et la précision', () => {
    expect(formatIngredient({ name: 'ail', quantity: 3, unit: 'gousse', note: 'écrasées' })).toBe('3 gousses ail (écrasées)')
    expect(formatIngredient({ name: 'farine', quantity: 200, unit: 'g', note: null })).toBe('200 g farine')
    expect(formatIngredient({ name: 'sel', quantity: null, unit: null, note: null })).toBe('sel')
    expect(formatIngredient({ name: 'cerfeuil', quantity: null, unit: null, note: '2 pluches' })).toBe('cerfeuil (2 pluches)')
  })

  it('ramène une unité importée à la liste, ou la range dans la précision', () => {
    expect(normalizeIngredientUnit({ name: 'sucre', quantity: 1, unit: 'cuillère à soupe bombée', note: null })).toEqual({ name: 'sucre', quantity: 1, unit: 'c. à s.', note: 'bombée' })
    expect(normalizeIngredientUnit({ name: 'rhum', quantity: 1.5, unit: 'shot', note: 'ambré' })).toEqual({ name: 'rhum', quantity: null, unit: null, note: '1,5 shot, ambré' })
    expect(normalizeIngredientUnit({ name: 'farine', quantity: 250, unit: 'g', note: '  ' })).toEqual({ name: 'farine', quantity: 250, unit: 'g', note: null })
    expect(normalizeIngredientUnit({ name: 'œufs', quantity: 3, unit: '', note: null })).toEqual({ name: 'œufs', quantity: 3, unit: null, note: null })
    expect(normalizeIngredientUnit({ name: 'thym', quantity: null, unit: 'pluche', note: null })).toEqual({ name: 'thym', quantity: null, unit: null, note: 'pluche' })
  })

  it('refuse une unité hors liste et une précision trop longue', () => {
    const base = recipeToFormValues({ title: 'T', servings: null, notes: null, url: null, tags: [] })
    const row = (patch: Partial<(typeof base.ingredients)[number]>) => ({ ...base, ingredients: [{ ...base.ingredients[0]!, name: 'x', ...patch }] })
    const key = base.ingredients[0]!.key
    expect(validateRecipeForm(row({ unit: 'pluche' })).ingredientRows).toEqual({ [key]: 'Unité inconnue : choisis-en une dans la liste' })
    expect(validateRecipeForm(row({ note: 'x'.repeat(201) })).ingredientRows).toEqual({ [key]: 'Précision trop longue (200 caractères maximum)' })
    expect(validateRecipeForm(row({ unit: 'c. à s.', note: 'rase' })).ingredientRows).toBeUndefined()
    // Une ligne avec seulement une précision compte comme saisie
    expect(validateRecipeForm({ ...base, ingredients: [{ ...base.ingredients[0]!, note: 'bio' }] }).ingredientRows).toEqual({ [key]: 'Nom manquant' })
  })
})

describe('sous-parties mélangées (anciennes données)', () => {
  it('un ingrédient sans sous-partie après une sous-partie n’y est pas rattaché', () => {
    const values = recipeToFormValues({
      title: 'Tarte', servings: null, notes: null, url: null, tags: [],
      ingredients: [
        { name: 'farine', quantity: 200, unit: 'g', note: null, section: 'Pour la pâte' },
        { name: 'sel', quantity: null, unit: null, note: null, section: null },
      ],
    })
    expect(values.ingredients.map((r) => (r.heading ? `# ${r.name}` : r.name))).toEqual(['# Pour la pâte', 'farine', '# ', 'sel'])
    expect(toSaveRecipeInput(null, values).ingredients.map((i) => [i.name, i.section])).toEqual([
      ['farine', 'Pour la pâte'],
      ['sel', null],
    ])
  })
})

describe('temps, source et sous-parties', () => {
  it('lit et écrit les durées', () => {
    expect(['45', '45 min', '1 h', '1h30', '1 h 30 min', '2 heures', ' 10 MIN ', ''].map(parseDuration)).toEqual([45, 45, 60, 90, 90, 120, 10, null])
    expect(parseDuration('une heure')).toBeNaN()
    expect(parseDuration('h')).toBeNaN()
    expect([45, 60, 90, 125, null, undefined].map(formatDuration)).toEqual(['45 min', '1 h', '1 h 30', '2 h 05', '', ''])
  })

  it('valide la source, les durées et les titres de sous-parties', () => {
    const heading = { key: 'h', name: 'x'.repeat(81), quantity: '', unit: '', note: '', heading: true }
    const errors = validateRecipeForm(form({ source: 's'.repeat(201), prepTime: 'longtemps', cookTime: '200 h', ingredients: [heading, ...form().ingredients] }))
    expect(errors).toMatchObject({ source: '200 caractères maximum', prepTime: 'Durée invalide (ex. 45 min, 1 h 30)', cookTime: 'Durée invalide (ex. 45 min, 1 h 30)' })
    expect(errors.restTime).toBeUndefined()
    expect(errors.ingredientRows).toEqual({ h: 'Titre trop long (80 caractères maximum)' })
  })

  it('range les ingrédients sous leur sous-partie, dans les deux sens', () => {
    const values = recipeToFormValues({
      title: 'Tarte', servings: 6, notes: null, url: null, tags: [], source: 'Pâtisserie maison, p. 146', prep_minutes: 10, rest_minutes: 120, cook_minutes: null,
      ingredients: [
        { name: 'bananes', quantity: 5, unit: null, note: null, section: null },
        { name: 'beurre', quantity: 40, unit: 'g', note: null, section: 'Pour le beurre d’amande' },
        { name: 'sucre glace', quantity: 40, unit: 'g', note: null, section: 'Pour le beurre d’amande' },
        { name: 'beurre demi-sel', quantity: 50, unit: 'g', note: null, section: 'Pour le streusel' },
      ],
    })
    expect(values).toMatchObject({ source: 'Pâtisserie maison, p. 146', prepTime: '10 min', restTime: '2 h', cookTime: '' })
    expect(values.ingredients.map((r) => (r.heading ? `# ${r.name}` : r.name))).toEqual([
      'bananes', '# Pour le beurre d’amande', 'beurre', 'sucre glace', '# Pour le streusel', 'beurre demi-sel',
    ])
    // Un titre vide ou retiré : les ingrédients suivants n'ont pas (ou plus) de sous-partie.
    const rows = [...values.ingredients]
    rows[4] = { ...rows[4]!, name: '  ' }
    const saved = toSaveRecipeInput(null, { ...values, ingredients: rows })
    expect(saved.ingredients.map((i) => [i.name, i.section])).toEqual([
      ['bananes', null], ['beurre', 'Pour le beurre d’amande'], ['sucre glace', 'Pour le beurre d’amande'], ['beurre demi-sel', null],
    ])
    expect(saved).toMatchObject({ source: 'Pâtisserie maison, p. 146', prepMinutes: 10, restMinutes: 120, cookMinutes: null })
    expect(filledIngredients(values.ingredients)).toHaveLength(4)
    expect(groupBySection(saved.ingredients).map((g) => [g.section, g.items.length])).toEqual([
      [null, 1], ['Pour le beurre d’amande', 2], [null, 1],
    ])
  })
})

describe('recettes liées', () => {
  const ingredient = (name: string, note: string | null = null) => ({ name, quantity: null, unit: null, note })

  it('repère un renvoi à une autre page', () => {
    expect(pageReference(ingredient('pâte sucrée', 'voir p. 208'))).toBe('p. 208')
    expect(pageReference(ingredient('pâte sucrée (page 12)'))).toBe('p. 12')
    expect(pageReference(ingredient('crème', 'voir P.45'))).toBe('p. 45')
    expect(pageReference(ingredient('poivre', '2 pincées'))).toBeNull()
    expect(pageReference(ingredient('pâte feuilletée', 'pur beurre'))).toBeNull()
  })

  it('liste les renvois pas encore liés, avec leur position', () => {
    expect(
      pendingLinks([
        ingredient('pâte sucrée', 'voir p. 208'),
        ingredient('bananes'),
        { ...ingredient('crème', 'voir p. 30'), linkedRecipe: { id: 'r2', title: 'Crème pâtissière' } },
        ingredient('streusel', 'p. 40'),
      ]),
    ).toEqual([
      { position: 0, name: 'pâte sucrée', page: 'p. 208' },
      { position: 3, name: 'streusel', page: 'p. 40' },
    ])
  })

  it('déduit la source et le titre de la sous-recette', () => {
    expect(linkedSource(' Pâtisserie maison ', 'p. 208')).toEqual({ source: 'Pâtisserie maison', page: '208' })
    expect(linkedSource(null, 'p. 208')).toEqual({ source: '', page: '208' })
    expect(linkedSource('Pâtisserie maison', '')).toEqual({ source: 'Pâtisserie maison', page: '' })
    expect(linkedTitle('  pâte sucrée ')).toBe('Pâte sucrée')
  })

  it('ouvre le formulaire de la sous-recette et en relit les paramètres', () => {
    const id = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
    const path = linkedImportPath(id, { position: 2, name: 'pâte sucrée & co', page: 'p. 208' })
    const params = new URL(path, 'https://food.test').searchParams
    expect(parseLinkedImport(params)).toEqual({ parentId: id, reference: { position: 2, name: 'pâte sucrée & co', page: 'p. 208' } })
    expect(parseLinkedImport(new URLSearchParams(`lier=${id}&nom=pâte`))).toBeNull()
    expect(parseLinkedImport(new URLSearchParams(`lier=${id}&ingredient=-1&nom=pâte`))).toBeNull()
    expect(parseLinkedImport(new URLSearchParams(`lier=${id}&ingredient=1&nom=+`))).toBeNull()
    expect(parseLinkedImport(new URLSearchParams('lier=pas-un-id&ingredient=1&nom=pâte'))).toBeNull()
    expect(parseLinkedImport(new URLSearchParams('ingredient=1&nom=pâte'))).toBeNull()
  })

  it('garde le lien d’un ingrédient dans le formulaire', () => {
    const linkedRecipe = { id: 'r2', title: 'Pâte sucrée' }
    const values = recipeToFormValues({ title: 'Tarte', servings: 6, notes: null, url: null, tags: [], ingredients: [{ ...ingredient('pâte sucrée'), linkedRecipe }] })
    expect(values.ingredients[0]!.linkedRecipe).toEqual(linkedRecipe)
    expect(toSaveRecipeInput('r1', values).ingredients[0]!.linkedRecipe).toEqual(linkedRecipe)
  })
})

describe('livre, page et valeurs nutritionnelles', () => {
  it('découpe une source qui contient la page, comme la base', () => {
    expect(splitSource('Pâtisserie maison, p. 146')).toEqual({ source: 'Pâtisserie maison', page: '146' })
    expect(splitSource('p. 146')).toEqual({ source: '', page: '146' })
    expect(splitSource('Magazine – pp. 12-13')).toEqual({ source: 'Magazine', page: '12-13' })
    expect(splitSource('Ottolenghi Simple')).toBeNull()
    expect(formatSource('Pâtisserie maison', '146')).toBe('Pâtisserie maison, p. 146')
    expect(formatSource(null, ' 146 ')).toBe('p. 146')
    expect(formatSource('Pâtisserie maison', '')).toBe('Pâtisserie maison')
    expect(formatSource(null, null)).toBe('')
  })

  it('reprend le livre, la page et les valeurs nutritionnelles d’un import', () => {
    const base = { title: 'Tarte', servings: 6, ingredients: [{ name: 'beurre', quantity: 50, unit: 'g', note: null }], steps: '', tags: [] }
    expect(importedToFormValues({ ...base, source: 'Pâtisserie maison', page: '146' }, '')).toMatchObject({ source: 'Pâtisserie maison', page: '146' })
    // Ancienne version de la fonction : la page dans la source
    expect(importedToFormValues({ ...base, source: 'Pâtisserie maison, p. 146' }, '')).toMatchObject({ source: 'Pâtisserie maison', page: '146' })
    expect(importedToFormValues({ ...base, source: 'Ottolenghi' }, '')).toMatchObject({ source: 'Ottolenghi', page: '' })
    const values = importedToFormValues({ ...base, nutrition: { per: '100 g', kcal: 320, carbs: 42.5, protein: 4, fat: null } }, '')
    expect(values).toMatchObject({ nutritionPer: '100 g', kcal: '320', carbs: '42,5', protein: '4', fat: '' })
    expect(toSaveRecipeInput(null, values).nutrition).toEqual({ per: '100 g', kcal: 320, carbs: 42.5, protein: 4, fat: null })
    expect(importedToFormValues({ ...base, nutrition: { per: 'bol', kcal: 1, carbs: null, protein: null, fat: null } }, '').nutritionPer).toBe('portion')
  })

  it('valide les valeurs nutritionnelles et n’envoie rien si aucune n’est saisie', () => {
    expect(validateRecipeForm(form({ kcal: '450', carbs: '52,5', protein: '18', fat: '14' })).nutrition).toBeUndefined()
    expect(validateRecipeForm(form({ kcal: '450,5' })).nutrition).toBe('Calories : nombre entier, 20 000 au plus')
    expect(validateRecipeForm(form({ kcal: '30000' })).nutrition).toBe('Calories : nombre entier, 20 000 au plus')
    expect(validateRecipeForm(form({ carbs: '12,25' })).nutrition).toBe('Glucides : en grammes, 1 décimale au plus')
    expect(validateRecipeForm(form({ fat: 'beaucoup' })).nutrition).toBe('Lipides : en grammes, 1 décimale au plus')
    expect(validateRecipeForm(form({ page: 'x'.repeat(21) })).page).toBe('20 caractères maximum')
    expect(toSaveRecipeInput(null, form()).nutrition).toBeNull()
    expect(toSaveRecipeInput(null, form({ page: ' 146 ' })).sourcePage).toBe('146')
  })

  it('affiche les valeurs nutritionnelles', () => {
    expect(formatNutrition({ nutrition_per: 'portion', kcal: 450, carbs_g: 52.5, protein_g: 18, fat_g: 14 })).toBe(
      '450 kcal · glucides 52,5 g · protéines 18 g · lipides 14 g (par portion)',
    )
    expect(formatNutrition({ nutrition_per: '100 g', kcal: null, carbs_g: null, protein_g: 4, fat_g: null })).toBe('protéines 4 g (pour 100 g)')
    expect(formatNutrition({ kcal: 300 })).toBe('300 kcal (par portion)')
    expect(formatNutrition({})).toBe('')
  })
})

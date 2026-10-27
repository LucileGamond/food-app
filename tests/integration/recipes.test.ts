import { DuplicateRecipeUrlError, RecipeInUseError } from '@/api'
import { createRecipesApi } from '@/api/recipes'
import { LUCILE, PNG_1PX, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

const curry = {
  id: null,
  title: 'Curry de légumes',
  notes: 'Faire revenir…',
  url: 'https://exemple.fr/curry',
  servings: 4,
  tags: ['végé', 'Rapide'],
  ingredients: [
    { name: 'Pois chiches', quantity: 400, unit: 'g', note: null },
    { name: 'Lait de coco', quantity: 0.5, unit: 'l', note: null },
    { name: 'Sel', quantity: null, unit: null, note: null },
  ],
}

describe('recipes api', () => {
  it('enregistre et relit une recette complète', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    const recipe = await api.recipes.getRecipe(id)
    expect(recipe).toEqual({
      id,
      is_saved: true,
      title: 'Curry de légumes',
      notes: 'Faire revenir…',
      url: 'https://exemple.fr/curry',
      servings: 4,
      tags: ['végé', 'Rapide'],
      source: null,
      prep_minutes: null,
      rest_minutes: null,
      cook_minutes: null,
      ingredients: curry.ingredients.map((i) => ({ ...i, section: null })),
      photos: [],
    })
  })

  it('enregistre la source, les temps et les sous-parties d’ingrédients', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe({
      ...curry,
      url: null,
      source: '  Pâtisserie maison, p. 146 ',
      prepMinutes: 10,
      restMinutes: 120,
      cookMinutes: 40,
      ingredients: [
        { name: 'Bananes', quantity: 5, unit: null, note: null, section: null },
        { name: 'Beurre demi-sel', quantity: 50, unit: 'g', note: null, section: ' Pour le streusel ' },
      ],
    })
    const recipe = await api.recipes.getRecipe(id)
    expect(recipe).toMatchObject({ source: 'Pâtisserie maison, p. 146', prep_minutes: 10, rest_minutes: 120, cook_minutes: 40 })
    expect(recipe!.ingredients.map((i) => i.section)).toEqual([null, 'Pour le streusel'])

    // Modification sans ces informations : elles sont effacées
    await api.recipes.saveRecipe({ ...curry, id, url: null })
    expect(await api.recipes.getRecipe(id)).toMatchObject({ source: null, prep_minutes: null, rest_minutes: null, cook_minutes: null })
    expect(await api.recipes.listSources()).toEqual([])
    await expect(api.recipes.saveRecipe({ ...curry, url: null, prepMinutes: 99_999 })).rejects.toBeInstanceOf(Error)
  })

  it('renvoie le nombre de personnes et les ingrédients de plusieurs recettes', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    const riz = [{ name: 'Riz', quantity: 1, unit: 'kg', note: null }]
    const other = await api.recipes.saveRecipe({ ...curry, title: 'Riz', url: null, servings: null, ingredients: riz })
    const result = await api.recipes.getIngredients([id, other])
    expect(result.sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0))).toEqual([
      { id, servings: 4, ingredients: curry.ingredients },
      { id: other, servings: null, ingredients: riz },
    ])
    expect(await api.recipes.getIngredients([])).toEqual([])
  })

  it('met à jour une recette en remplaçant ses ingrédients', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    await api.recipes.saveRecipe({ ...curry, id, title: 'Curry express', notes: null, url: null, servings: null, ingredients: [{ name: 'Riz', quantity: 1, unit: 'kg', note: null }] })
    expect(await api.recipes.getRecipe(id)).toMatchObject({
      title: 'Curry express', notes: null, url: null, servings: null, ingredients: [{ name: 'Riz', quantity: 1, unit: 'kg', note: null }],
    })
  })

  it('ne liste que les recettes sauvegardées', async () => {
    const { api } = await signedInApi()
    await api.recipes.saveRecipe(curry)
    await api.recipes.saveRecipe({ ...curry, title: 'Banana bread', url: 'https://exemple.fr/banana-bread', tags: ['dessert', 'végé'] })
    await api.meals.createMeal({
      date: '2026-10-20', slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'adhoc', title: 'Ponctuelle', notes: '', url: '' },
    })

    const list = await api.recipes.listSavedRecipes()
    expect(list.map((r) => r.title)).toEqual(['Banana bread', 'Curry de légumes'])
    expect(list[1]).toMatchObject({ ingredientNames: ['Pois chiches', 'Lait de coco', 'Sel'], mainPhotoPath: null })

    const summaries = await api.recipes.listSavedSummaries()
    expect(summaries.map((r) => r.title)).toEqual(['Banana bread', 'Curry de légumes'])
    expect(await api.recipes.listTags()).toEqual(['dessert', 'Rapide', 'végé'])
  })

  it('sauvegarde une recette ponctuelle sans casser le lien avec le planning', async () => {
    const { api } = await signedInApi()
    await api.meals.createMeal({
      date: '2026-10-20', slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'adhoc', title: 'Quiche', notes: 'mamie', url: '' },
    })
    const [meal] = await api.meals.listMeals('2026-10-20', '2026-10-20')
    const recipeId = meal!.recipe.id

    await api.recipes.saveRecipe({ ...curry, id: recipeId, title: 'Quiche lorraine', ingredients: [{ name: 'Lardons', quantity: 200, unit: 'g', note: null }] })

    const [after] = await api.meals.listMeals('2026-10-20', '2026-10-20')
    expect(after!.recipe).toMatchObject({ id: recipeId, is_saved: true, title: 'Quiche lorraine' })
    expect((await api.recipes.listSavedRecipes()).map((r) => r.title)).toEqual(['Quiche lorraine'])
  })

  it('bloque la suppression d’une recette utilisée et liste ses dates', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    await api.meals.createMeal({ date: '2026-10-22', slot: 'DINNER', people: [LUCILE.id], source: { kind: 'saved', recipeId: id } })
    await api.meals.createMeal({ date: '2026-10-21', slot: 'LUNCH', people: [LUCILE.id], source: { kind: 'saved', recipeId: id } })

    expect(await api.recipes.listUsages(id)).toEqual([
      { meal_date: '2026-10-21', slot: 'LUNCH' },
      { meal_date: '2026-10-22', slot: 'DINNER' },
    ])
    await expect(api.recipes.deleteRecipe(id)).rejects.toBeInstanceOf(RecipeInUseError)
    expect(await api.recipes.getRecipe(id)).not.toBeNull()
  })

  it('supprime une recette inutilisée avec ses photos', async () => {
    const { api, db } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    const photo = await api.photos.uploadPhoto(id, PNG_1PX)

    await api.recipes.deleteRecipe(id)

    expect(await api.recipes.getRecipe(id)).toBeNull()
    const { data } = await db.storage.from('recipe-photos').list(id)
    expect(data?.filter((f) => photo.storage_path.endsWith(f.name))).toEqual([])
  })

  it('refuse une recette sans ingrédient', async () => {
    const { api } = await signedInApi()
    await expect(api.recipes.saveRecipe({ ...curry, ingredients: [] })).rejects.toThrow('Certaines valeurs sont invalides.')
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createRecipesApi(anonClient())
    const missing = '99999999-9999-9999-9999-999999999999'
    await expect(api.listSavedRecipes()).rejects.toThrow(/accès/)
    await expect(api.listSavedSummaries()).rejects.toThrow()
    await expect(api.getRecipe(missing)).rejects.toThrow()
    await expect(api.listUsages(missing)).rejects.toThrow()
    await expect(api.listTags()).rejects.toThrow()
    await expect(api.deleteRecipe(missing)).rejects.toThrow()
  })

  it('refuse un lien déjà enregistré et permet de basculer le planning sur la recette existante', async () => {
    const { api } = await signedInApi()
    const curryId = await api.recipes.saveRecipe(curry)
    expect(await api.recipes.findSavedByUrl('https://www.exemple.fr/curry/')).toEqual({ id: curryId, title: 'Curry de légumes' })
    expect(await api.recipes.findSavedByUrl('https://exemple.fr/curry', curryId)).toBeNull()
    expect(await api.recipes.findSavedByUrl('https://exemple.fr/autre')).toBeNull()

    // Modifier la recette elle-même avec son propre lien reste possible
    await api.recipes.saveRecipe({ ...curry, id: curryId, title: 'Curry du chef' })

    const error = await api.recipes.saveRecipe({ ...curry, title: 'Doublon', url: 'http://exemple.fr/curry#notes' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DuplicateRecipeUrlError)
    expect(error).toMatchObject({ existing: { id: curryId, title: 'Curry du chef' }, message: 'Cette recette est déjà enregistrée : « Curry du chef ».' })

    // Recette ponctuelle du planning avec le même lien → bascule sur la recette sauvegardée
    await api.meals.createMeal({
      date: '2026-10-20', slot: 'DINNER', people: [LUCILE.id], source: { kind: 'adhoc', title: 'Curry ce soir', notes: '', url: 'https://exemple.fr/curry' },
    })
    const [meal] = await api.meals.listMeals('2026-10-20', '2026-10-20')
    expect(await api.recipes.useSavedRecipe(meal!.recipe.id, curryId)).toBe(1)
    const [after] = await api.meals.listMeals('2026-10-20', '2026-10-20')
    expect(after!.recipe).toMatchObject({ id: curryId, is_saved: true, title: 'Curry du chef' })
    expect(await api.recipes.getRecipe(meal!.recipe.id)).toBeNull()
  })

  it('refuse la recherche par lien et la bascule sans connexion ou avec des recettes invalides', async () => {
    const anon = createRecipesApi(anonClient())
    await expect(anon.findSavedByUrl('https://exemple.fr/curry')).rejects.toThrow(/accès/)
    await expect(anon.useSavedRecipe(LUCILE.id, LUCILE.id)).rejects.toThrow(/accès/)
    const { api } = await signedInApi()
    await expect(api.recipes.useSavedRecipe(LUCILE.id, LUCILE.id)).rejects.toThrow('Élément introuvable')
  })
})

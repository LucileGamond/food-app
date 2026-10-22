import { RecipeInUseError } from '@/api'
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
    { name: 'Pois chiches', quantity: 400, unit: 'g' },
    { name: 'Lait de coco', quantity: 0.5, unit: 'l' },
    { name: 'Sel', quantity: null, unit: null },
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
      ingredients: curry.ingredients,
      photos: [],
    })
  })

  it('met à jour une recette en remplaçant ses ingrédients', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe(curry)
    await api.recipes.saveRecipe({ ...curry, id, title: 'Curry express', notes: null, url: null, servings: null, ingredients: [{ name: 'Riz', quantity: 1, unit: 'kg' }] })
    expect(await api.recipes.getRecipe(id)).toMatchObject({
      title: 'Curry express', notes: null, url: null, servings: null, ingredients: [{ name: 'Riz', quantity: 1, unit: 'kg' }],
    })
  })

  it('ne liste que les recettes sauvegardées', async () => {
    const { api } = await signedInApi()
    await api.recipes.saveRecipe(curry)
    await api.recipes.saveRecipe({ ...curry, title: 'Banana bread', tags: ['dessert', 'végé'] })
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

    await api.recipes.saveRecipe({ ...curry, id: recipeId, title: 'Quiche lorraine', ingredients: [{ name: 'Lardons', quantity: 200, unit: 'g' }] })

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
})

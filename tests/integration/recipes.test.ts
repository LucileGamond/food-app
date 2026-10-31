import { DuplicateRecipeUrlError, RecipeInUseError } from '@/api'
import { createRecipesApi } from '@/api/recipes'
import { ERIC, LUCILE, PNG_1PX, anonClient, resetData, signedInApi } from './helpers'

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
      source_page: null,
      nutrition_per: null,
      kcal: null,
      carbs_g: null,
      protein_g: null,
      fat_g: null,
      prep_minutes: null,
      rest_minutes: null,
      cook_minutes: null,
      ingredients: curry.ingredients.map((i) => ({ ...i, section: null, linkedRecipe: null })),
      photos: [],
      reviews: [],
    })
  })

  it('enregistre la source, les temps et les sous-parties d’ingrédients', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe({
      ...curry,
      url: null,
      source: '  Pâtisserie maison ',
      sourcePage: ' 146 ',
      nutrition: { per: '100 g', kcal: 320, carbs: 42.5, protein: 4, fat: 15.2 },
      prepMinutes: 10,
      restMinutes: 120,
      cookMinutes: 40,
      ingredients: [
        { name: 'Bananes', quantity: 5, unit: null, note: null, section: null },
        { name: 'Beurre demi-sel', quantity: 50, unit: 'g', note: null, section: ' Pour le streusel ' },
      ],
    })
    const recipe = await api.recipes.getRecipe(id)
    expect(recipe).toMatchObject({
      source: 'Pâtisserie maison',
      source_page: '146',
      nutrition_per: '100 g',
      kcal: 320,
      carbs_g: 42.5,
      protein_g: 4,
      fat_g: 15.2,
      prep_minutes: 10,
      rest_minutes: 120,
      cook_minutes: 40,
    })
    expect(await api.recipes.listSources()).toEqual(['Pâtisserie maison'])
    expect(recipe!.ingredients.map((i) => i.section)).toEqual([null, 'Pour le streusel'])

    // Modification sans ces informations : elles sont effacées
    await api.recipes.saveRecipe({ ...curry, id, url: null })
    expect(await api.recipes.getRecipe(id)).toMatchObject({ source: null, source_page: null, kcal: null, nutrition_per: null, prep_minutes: null, rest_minutes: null, cook_minutes: null })
    expect(await api.recipes.listSources()).toEqual([])
    await expect(api.recipes.saveRecipe({ ...curry, url: null, prepMinutes: 99_999 })).rejects.toBeInstanceOf(Error)
  })

  it('lie un ingrédient à une sous-recette, dans un seul sens', async () => {
    const { api } = await signedInApi()
    const pate = await api.recipes.saveRecipe({ ...curry, url: null, title: 'Pâte sucrée', ingredients: [{ name: 'Farine', quantity: 250, unit: 'g', note: null }] })
    const tarte = await api.recipes.saveRecipe({
      ...curry,
      url: null,
      title: 'Tarte',
      ingredients: [
        { name: 'Pâte sucrée', quantity: 200, unit: 'g', note: 'voir p. 208' },
        { name: 'Bananes', quantity: 5, unit: null, note: null },
      ],
    })
    await api.recipes.linkIngredient(tarte, { position: 0, name: 'Pâte sucrée' }, pate)
    const linked = await api.recipes.getRecipe(tarte)
    expect(linked!.ingredients.map((i) => i.linkedRecipe)).toEqual([{ id: pate, title: 'Pâte sucrée' }, null])
    expect((await api.recipes.getRecipe(pate))!.ingredients.map((i) => i.linkedRecipe)).toEqual([null])

    // Réenregistrée depuis le formulaire : le lien suit l'ingrédient, même déplacé
    await api.recipes.saveRecipe({ ...curry, id: tarte, url: null, title: 'Tarte', ingredients: [linked!.ingredients[1]!, linked!.ingredients[0]!] })
    expect((await api.recipes.getRecipe(tarte))!.ingredients.map((i) => i.linkedRecipe?.title ?? null)).toEqual([null, 'Pâte sucrée'])

    await api.recipes.linkIngredient(tarte, { position: 1, name: 'Pâte sucrée' }, null)
    expect((await api.recipes.getRecipe(tarte))!.ingredients.map((i) => i.linkedRecipe)).toEqual([null, null])
    await expect(api.recipes.linkIngredient(tarte, { position: 0, name: 'Bananes' }, tarte)).rejects.toThrow('Cette recette n’existe plus')
    // Recette modifiée entre-temps (l'ingrédient n'est plus à cette place) : rien n'est lié au mauvais ingrédient
    await expect(api.recipes.linkIngredient(tarte, { position: 0, name: 'Pâte sucrée' }, pate)).rejects.toThrow('La recette a été modifiée entre-temps')

    // Sous-recette utilisée : suppression refusée, avec les recettes qui l'utilisent
    await api.recipes.linkIngredient(tarte, { position: 1, name: 'Pâte sucrée' }, pate)
    expect(await api.recipes.listUsages(pate)).toEqual({ meals: [], recipes: [{ id: tarte, title: 'Tarte' }] })
    const refused = api.recipes.deleteRecipe(pate)
    await expect(refused).rejects.toBeInstanceOf(RecipeInUseError)
    await expect(refused).rejects.toThrow('utilisée dans une autre recette')
    expect(await api.recipes.getRecipe(pate)).not.toBeNull()
    // La recette principale reste supprimable, et libère la sous-recette
    await api.recipes.deleteRecipe(tarte)
    await api.recipes.deleteRecipe(pate)
    expect(await api.recipes.getRecipe(pate)).toBeNull()
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
    expect(summaries.map((r) => [r.title, r.source])).toEqual([['Banana bread', null], ['Curry de légumes', null]])
    expect(await api.recipes.listTags()).toEqual(['dessert', 'Rapide', 'végé'])
  })

  it('liste les recettes avec temps, calories, livre, historique et note moyenne', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe({
      ...curry,
      source: 'Ottolenghi',
      sourcePage: '12',
      prepMinutes: 15,
      cookMinutes: 20,
      nutrition: { per: 'portion', kcal: 450, carbs: null, protein: null, fat: null },
    })
    for (const date of ['2026-10-01', '2026-10-20', '2026-11-05']) {
      await api.meals.createMeal({ date, slot: 'DINNER', people: [LUCILE.id], source: { kind: 'saved', recipeId: id } })
    }
    await api.recipes.saveReview(id, { rating: 4, comment: '  Moins épicé  ' })
    const eric = await signedInApi(ERIC.email)
    await eric.api.recipes.saveReview(id, { rating: 5, comment: '' })

    const [item] = await api.recipes.listSavedRecipes('2026-10-31')
    expect(item).toMatchObject({
      source: 'Ottolenghi',
      sourcePage: '12',
      url: 'https://exemple.fr/curry',
      totalMinutes: 35,
      kcal: 450,
      nutritionPer: 'portion',
      vegetarian: true,
      timesCooked: 2,
      lastCooked: '2026-10-20',
      nextPlanned: '2026-11-05',
      rating: 4.5,
    })
    expect(await api.recipes.getHistory(id, '2026-10-31')).toEqual({ timesCooked: 2, lastCooked: '2026-10-20', nextPlanned: '2026-11-05' })
    expect((await api.recipes.getRecipe(id))!.reviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: LUCILE.id, rating: 4, comment: 'Moins épicé' }),
        expect.objectContaining({ profileId: ERIC.id, rating: 5, comment: null }),
      ]),
    )

    // Avis vidé : retiré
    await api.recipes.saveReview(id, { rating: null, comment: ' ' })
    expect((await api.recipes.getRecipe(id))!.reviews!.map((r) => r.profileId)).toEqual([ERIC.id])
    await expect(api.recipes.saveReview(id, { rating: 9, comment: '' })).rejects.toThrow('Certaines valeurs sont invalides.')
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

    expect(await api.recipes.listUsages(id)).toEqual({
      meals: [
        { meal_date: '2026-10-21', slot: 'LUNCH' },
        { meal_date: '2026-10-22', slot: 'DINNER' },
      ],
      recipes: [],
    })
    await expect(api.recipes.deleteRecipe(id)).rejects.toThrow('utilisée dans le planning')
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
    await expect(api.linkIngredient(missing, { position: 0, name: 'x' }, null)).rejects.toThrow()
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

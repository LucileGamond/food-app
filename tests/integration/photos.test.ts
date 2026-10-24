import { AppError } from '@/api'
import { createPhotosApi } from '@/api/photos'
import { PNG_1PX, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

async function recipeWithApi() {
  const ctx = await signedInApi()
  const id = await ctx.api.recipes.saveRecipe({
    id: null, title: 'Tarte', notes: null, url: null, servings: null, tags: [], ingredients: [{ name: 'Pommes', quantity: 4, unit: null, note: null }],
  })
  return { ...ctx, id }
}

describe('photos api', () => {
  it('envoie des photos dans l’ordre et fournit des URL signées', async () => {
    const { api, id } = await recipeWithApi()
    const first = await api.photos.uploadPhoto(id, PNG_1PX)
    const second = await api.photos.uploadPhoto(id, PNG_1PX)

    expect(first.position).toBe(0)
    expect(second.position).toBe(1)
    expect(first.storage_path).toMatch(new RegExp(`^${id}/[0-9a-f-]+\\.png$`))

    const urls = await api.photos.signedUrls([first.storage_path, second.storage_path])
    expect(Object.keys(urls).sort()).toEqual([first.storage_path, second.storage_path].sort())
    const response = await fetch(urls[first.storage_path]!)
    expect(response.ok).toBe(true)

    expect(await api.photos.signedUrls([])).toEqual({})
  })

  it('change la photo principale et supprime une photo', async () => {
    const { api, id } = await recipeWithApi()
    const first = await api.photos.uploadPhoto(id, PNG_1PX)
    const second = await api.photos.uploadPhoto(id, PNG_1PX)

    await api.photos.reorderPhotos([second.id, first.id])
    let recipe = await api.recipes.getRecipe(id)
    expect(recipe?.photos.map((p) => p.id)).toEqual([second.id, first.id])
    expect((await api.recipes.listSavedRecipes())[0]?.mainPhotoPath).toBe(second.storage_path)

    await api.photos.deletePhoto(second)
    recipe = await api.recipes.getRecipe(id)
    expect(recipe?.photos.map((p) => p.id)).toEqual([first.id])
  })

  it('refuse les formats non pris en charge', async () => {
    const { api, id } = await recipeWithApi()
    await expect(api.photos.uploadPhoto(id, new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow(/Format/)
  })

  it('n’enregistre pas de photo pour une recette inexistante et nettoie le fichier envoyé', async () => {
    const { api, db } = await signedInApi()
    const missing = '99999999-9999-9999-9999-999999999999'
    await expect(api.photos.uploadPhoto(missing, PNG_1PX)).rejects.toBeInstanceOf(AppError)
    const { data } = await db.storage.from('recipe-photos').list(missing)
    expect(data ?? []).toEqual([])
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createPhotosApi(anonClient())
    await expect(api.uploadPhoto('99999999-9999-9999-9999-999999999999', PNG_1PX)).rejects.toThrow(/envoyer/)
    expect(await api.signedUrls(['x/y.png'])).toEqual({})
    await expect(api.deletePhoto({ id: '99999999-9999-9999-9999-999999999999', storage_path: 'x' })).rejects.toThrow()
    await expect(api.reorderPhotos(['99999999-9999-9999-9999-999999999999'])).rejects.toThrow()
  })
})

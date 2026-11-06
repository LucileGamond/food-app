import { createApi } from '@/api'
import { createAppClient } from '@/api/client'
import { keepForLater, saveDirectly } from '@/services/quickImport'
import { LOCAL_ANON_KEY, LUCILE, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

// JPEG minimal (en-tête) : le stockage ne vérifie que le type déclaré.
const jpeg = () => new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], { type: 'image/jpeg' })

describe('listes « De côté » et « À planifier » : liens et photos en attente', () => {
  it('met de côté un lien, le déplace vers « À planifier », puis l’enregistre comme recette', async () => {
    const { api } = await signedInApi()
    const id = await api.inbox.addItem({ url: 'https://www.instagram.com/reel/abc/', title: 'Curry du reel', list: 'aside' })
    expect((await api.inbox.listItems('aside')).map((i) => [i.title, i.list])).toEqual([['Curry du reel', 'aside']])
    expect(await api.inbox.listItems()).toEqual([])
    // Un lien n'est que dans une liste.
    await expect(api.inbox.addItem({ url: 'https://instagram.com/reel/abc', title: 'x' })).rejects.toThrow('Déjà dans « À planifier » ou « De côté »')

    await api.inbox.moveItem(id, 'plan')
    expect((await api.inbox.listItems()).map((i) => i.title)).toEqual(['Curry du reel'])

    const recipeId = await api.recipes.saveRecipe({ id: null, title: 'Curry coco', notes: null, url: 'https://www.instagram.com/reel/abc/', servings: 2, tags: [], ingredients: [{ name: 'riz', quantity: 1, unit: null, note: null }] })
    await api.inbox.resolveItem(id, recipeId)
    expect((await api.inbox.listItems()).map((i) => [i.title, i.recipe_id, i.url])).toEqual([['Curry coco', recipeId, null]])
  })

  it('photos mises de côté : envoyées, relues, puis retirées du stockage une fois la recette enregistrée', async () => {
    const { api } = await signedInApi()
    const paths = await api.inbox.uploadPhotos([jpeg(), jpeg()])
    expect(paths).toHaveLength(2)
    expect(paths.every((p) => /^pending\/[0-9a-f-]+\.jpg$/.test(p))).toBe(true)
    const id = await api.inbox.addItem({ title: 'Tarte du livre', photos: paths, list: 'aside' })
    const [item] = await api.inbox.listItems('aside')
    expect(item).toMatchObject({ id, title: 'Tarte du livre', photos: paths, url: null })

    const files = await api.inbox.downloadPhotos(paths)
    expect(files.map((f) => f.name)).toEqual(['page-1.jpg', 'page-2.jpg'])
    expect(files[0]!.size).toBe(6)

    const recipeId = await api.recipes.saveRecipe({ id: null, title: 'Tarte', notes: null, url: null, servings: 4, tags: [], ingredients: [{ name: 'pommes', quantity: 4, unit: null, note: null }] })
    await api.inbox.resolveItem(id, recipeId)
    expect(await api.inbox.listItems('aside')).toEqual([])
    await expect(api.inbox.downloadPhotos(paths)).rejects.toThrow('Impossible de récupérer les photos mises de côté.')
  })

  it('photos à planifier : planifiées, elles deviennent les photos du repas ; retirées, elles quittent le stockage', async () => {
    const { api } = await signedInApi()
    const kept = await api.inbox.uploadPhotos([jpeg()])
    const planned = await api.inbox.addItem({ title: 'Quiche du livre', photos: kept })
    await api.inbox.planItem(planned, '2026-11-03', 'DINNER', [LUCILE.id])
    const [meal] = await api.meals.listMeals('2026-11-03', '2026-11-03')
    const recipe = await api.recipes.getRecipe(meal!.recipe.id)
    expect(recipe).toMatchObject({ title: 'Quiche du livre', is_saved: false })
    expect(recipe!.photos.map((p) => p.storage_path)).toEqual(kept)

    const dropped = await api.inbox.uploadPhotos([jpeg()])
    const item = await api.inbox.addItem({ title: 'Brouillon', photos: dropped })
    await api.inbox.deleteItem(item, dropped)
    expect(await api.inbox.listItems()).toEqual([])
    await expect(api.inbox.downloadPhotos(dropped)).rejects.toThrow()
  })

  it('« garder pour plus tard » un lien : titre provisoire puis titre de la page', async () => {
    const { api } = await signedInApi()
    await keepForLater(api, { kind: 'link', url: 'https://cuisine.exemple.fr/tatin', title: 'Tarte tatin' }, 'aside')
    expect((await api.inbox.listItems('aside')).map((i) => i.title)).toEqual(['Tarte tatin'])
  })

  it('« enregistrer directement » un lien déjà enregistré : la recette existante, sans analyse', async () => {
    const { api } = await signedInApi()
    const id = await api.recipes.saveRecipe({ id: null, title: 'Tarte tatin', notes: null, url: 'https://cuisine.exemple.fr/tatin', servings: 6, tags: [], ingredients: [{ name: 'pommes', quantity: 6, unit: null, note: null }] })
    expect(await saveDirectly(api, { kind: 'link', url: 'https://www.cuisine.exemple.fr/tatin/' }, [])).toEqual({ kind: 'duplicate', recipe: { id, title: 'Tarte tatin' } })
    // Lien nouveau : la vraie fonction locale (sans clé du modèle) le signale.
    await expect(saveDirectly(api, { kind: 'link', url: 'https://cuisine.exemple.fr/crepes' }, [])).rejects.toThrow('Le service d’analyse est mal configuré.')
  })

  it('signale une base ou un stockage injoignable', async () => {
    const api = createApi(createAppClient('http://127.0.0.1:9', LOCAL_ANON_KEY, { persistSession: false }))
    await expect(api.inbox.uploadPhotos([jpeg()])).rejects.toThrow("Impossible d'envoyer les photos.")
    await expect(api.inbox.listItems('aside')).rejects.toThrow('Connexion impossible')
    await expect(api.inbox.moveItem('x', 'plan')).rejects.toThrow('Connexion impossible')
    await expect(api.inbox.resolveItem('x', 'y')).rejects.toThrow('Connexion impossible')
  })

  it('refuse d’enregistrer un élément avec une recette non enregistrée', async () => {
    const { api } = await signedInApi()
    const id = await api.inbox.addItem({ title: 'Idée', list: 'aside' })
    await expect(api.inbox.resolveItem(id, '00000000-0000-4000-8000-000000000000')).rejects.toThrow('introuvable')
    expect(await api.inbox.listItems('aside')).toHaveLength(1)
  })
})

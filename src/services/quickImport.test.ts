import { AppError } from '@/api'
import { compressForReading, cropImage } from '@/lib/image'
import { fakeApi } from '@/test/fakes'
import { keepForLater, saveDirectly } from './quickImport'
import type { RecipeImport } from '@/lib/recipes'

vi.mock('@/lib/image', () => ({
  compressForReading: vi.fn(async (file: File) => new Blob([`réduite ${file.name}`], { type: 'image/jpeg' })),
  compressImage: vi.fn(async (file: File) => new Blob([`photo ${file.name}`], { type: 'image/jpeg' })),
  cropImage: vi.fn(async (file: File) => new File([`plat ${file.name}`], 'photo-du-plat.jpg', { type: 'image/jpeg' })),
}))

const recipe = (title: string, extra: Partial<RecipeImport['recipe']> = {}): RecipeImport['recipe'] => ({
  title,
  servings: 4,
  ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null }],
  steps: '1. Mélanger.',
  tags: [],
  ...extra,
})
const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const URL_ = 'https://cuisine.exemple.fr/tarte'

describe('enregistrer directement', () => {
  it('un lien : analysé, enregistré avec le lien et la photo de la page', async () => {
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValue({ recipe: recipe('Tarte'), source: 'structured', image: { data: btoa('img'), type: 'image/jpeg' } })
    api.recipes.saveRecipe.mockResolvedValue('r1')
    expect(await saveDirectly(api, { kind: 'link', url: URL_ }, ['dessert'])).toEqual({ kind: 'saved', recipes: [{ id: 'r1', title: 'Tarte' }] })
    expect(api.recipes.importFromUrl).toHaveBeenCalledWith(URL_, ['dessert'])
    expect(api.recipes.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: null, title: 'Tarte', url: URL_ }))
    expect(api.photos.uploadPhoto).toHaveBeenCalledWith('r1', expect.any(Blob))
  })

  it('un lien déjà enregistré : rien n’est analysé', async () => {
    const api = fakeApi()
    api.recipes.findSavedByUrl.mockResolvedValue({ id: 'r9', title: 'Tarte' })
    expect(await saveDirectly(api, { kind: 'link', url: URL_ }, [])).toEqual({ kind: 'duplicate', recipe: { id: 'r9', title: 'Tarte' } })
    expect(api.recipes.importFromUrl).not.toHaveBeenCalled()
  })

  it('une recette incomplète n’est pas enregistrée ; une photo qui échoue ne bloque rien', async () => {
    const api = fakeApi()
    api.recipes.importFromUrl.mockResolvedValueOnce({ recipe: recipe(''), source: 'text', image: null })
    expect(await saveDirectly(api, { kind: 'link', url: URL_ }, [])).toEqual({ kind: 'incomplete', message: expect.stringMatching(/titre/i) })
    expect(api.recipes.saveRecipe).not.toHaveBeenCalled()

    api.recipes.importFromUrl.mockResolvedValueOnce({ recipe: recipe('Tarte'), source: 'structured', image: { data: btoa('img'), type: 'image/png' } })
    api.photos.uploadPhoto.mockRejectedValueOnce(new AppError("Impossible d'envoyer la photo."))
    expect((await saveDirectly(api, { kind: 'link', url: URL_ }, [])).kind).toBe('saved')
  })

  it('des photos : chaque recette de la page est enregistrée, avec la photo du plat recadrée', async () => {
    const api = fakeApi()
    const area = { image: 1, left: 0, top: 0, right: 1, bottom: 0.5 }
    api.recipes.importFromPhotos.mockResolvedValue({ recipe: recipe('Pâte'), recipes: [recipe('Pâte'), recipe('Quiche', { photo: area }), recipe('')], source: 'photo', image: null })
    api.recipes.saveRecipe.mockImplementation(async (input) => `id-${input.title}`)
    const pages = [file('p1.jpg'), file('p2.jpg'), file('p3.jpg'), file('p4.jpg')]
    expect(await saveDirectly(api, { kind: 'photos', files: pages }, [])).toEqual({
      kind: 'saved',
      recipes: [
        { id: 'id-Pâte', title: 'Pâte' },
        { id: 'id-Quiche', title: 'Quiche' },
      ],
    })
    // 3 images au plus, réduites pour la lecture ; la photo du plat est recadrée dans l'image d'origine.
    expect(compressForReading).toHaveBeenCalledTimes(3)
    expect(cropImage).toHaveBeenCalledWith(pages[1], area)
    expect(api.photos.uploadPhoto).toHaveBeenCalledWith('id-Quiche', expect.any(File))
  })

  it('des photos : une recette du même titre et du même livre n’est pas enregistrée deux fois', async () => {
    const api = fakeApi()
    api.recipes.listSavedSummaries.mockResolvedValue([
      { id: 'r1', is_saved: true, title: 'Pâte brisée', notes: null, url: null, tags: [], source: 'Pâtisserie maison' },
      { id: 'r2', is_saved: true, title: 'Quiche', notes: null, url: null, tags: [], source: null },
    ])
    // Même titre et même livre (casse et accents ignorés) : déjà enregistrée ; même titre dans un autre livre : nouvelle
    api.recipes.importFromPhotos.mockResolvedValueOnce({
      recipe: recipe('pate brisee'),
      recipes: [recipe('pate brisee', { source: 'Patisserie Maison' }), recipe('Quiche', { source: 'Tartes du dimanche' })],
      source: 'photo',
      image: null,
    })
    api.recipes.saveRecipe.mockImplementation(async (input) => `id-${input.title}`)
    expect(await saveDirectly(api, { kind: 'photos', files: [file('p.jpg')] }, [])).toEqual({ kind: 'saved', recipes: [{ id: 'id-Quiche', title: 'Quiche' }] })
    expect(api.recipes.saveRecipe).toHaveBeenCalledTimes(1)

    // Tout est déjà enregistré : on le dit, avec la recette existante
    api.recipes.importFromPhotos.mockResolvedValueOnce({ recipe: recipe('Pâte brisée', { source: 'Pâtisserie maison' }), source: 'photo', image: null })
    expect(await saveDirectly(api, { kind: 'photos', files: [file('p.jpg')] }, [])).toEqual({ kind: 'duplicate', recipe: { id: 'r1', title: 'Pâte brisée' } })
  })

  it('des photos sans recette complète', async () => {
    const api = fakeApi()
    api.recipes.importFromPhotos.mockResolvedValue({ recipe: recipe('', { ingredients: [] }), source: 'photo', image: null })
    expect(await saveDirectly(api, { kind: 'photos', files: [file('p.jpg')] }, [])).toMatchObject({ kind: 'incomplete' })
  })
})

describe('garder pour plus tard', () => {
  it('un lien : ajouté à la liste avec le nom du site, puis le titre de la page', async () => {
    const api = fakeApi()
    api.inbox.fetchTitle.mockResolvedValue('Tarte fine aux pommes')
    expect(await keepForLater(api, { kind: 'link', url: URL_ }, 'aside')).toBe('new-item')
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: URL_, title: 'cuisine.exemple.fr', list: 'aside' })
    await vi.waitFor(() => expect(api.inbox.renameItem).toHaveBeenCalledWith('new-item', 'Tarte fine aux pommes', 'cuisine.exemple.fr'))
  })

  it('un lien partagé avec son titre : pas de recherche du titre', async () => {
    const api = fakeApi()
    await keepForLater(api, { kind: 'link', url: URL_, title: ' Tarte ' }, 'plan')
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: URL_, title: 'Tarte', list: 'plan' })
    expect(api.inbox.fetchTitle).not.toHaveBeenCalled()
  })

  it('des photos : réduites, envoyées, puis ajoutées ; retirées du stockage si l’ajout échoue', async () => {
    const api = fakeApi()
    await keepForLater(api, { kind: 'photos', files: [file('a.jpg'), file('b.jpg')] }, 'plan')
    expect(api.inbox.uploadPhotos).toHaveBeenCalledWith([expect.any(Blob), expect.any(Blob)])
    expect(api.inbox.addItem).toHaveBeenCalledWith({ title: expect.stringMatching(/^Photos du /), photos: ['pending/photo-1.jpg', 'pending/photo-2.jpg'], list: 'plan' })

    api.inbox.addItem.mockRejectedValueOnce(new AppError('Hors ligne'))
    await expect(keepForLater(api, { kind: 'photos', files: [file('a.jpg')] }, 'aside')).rejects.toThrow('Hors ligne')
    expect(api.inbox.removePhotos).toHaveBeenCalledWith(['pending/photo-1.jpg'])
  })
})

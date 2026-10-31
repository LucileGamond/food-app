import { AppError } from '@/api'
import { compressForReading } from '@/lib/image'
import { fakeApi } from '@/test/fakes'
import { imageFiles, importOne, mergeRetry, needsRetry, runQueue, tally, type BatchContext } from './batchImport'
import type { RecipeImport } from './recipes'
import { recipeKey } from './sources'

vi.mock('@/lib/image', () => ({ compressForReading: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })) }))

const file = (name: string, type = 'image/jpeg', path = '') => {
  const f = new File(['x'], name, { type })
  if (path) Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

const read = (title: string, extra: Partial<RecipeImport['recipe']> = {}): RecipeImport => ({
  recipe: { title, servings: 4, ingredients: [{ name: 'farine', quantity: 200, unit: 'g', note: null }], steps: '1. Mélanger.', tags: ['dessert'], ...extra },
  source: 'photo',
  image: null,
})

describe('import en série', () => {
  it('garde les images d’un dossier, triées par nom en ordre naturel', () => {
    const files = [
      file('page10.jpg', 'image/jpeg', 'Livre/page10.jpg'),
      file('notes.txt', 'text/plain', 'Livre/notes.txt'),
      file('page2.PNG', '', 'Livre/page2.PNG'),
      file('page1.webp', 'image/webp', 'Livre/page1.webp'),
    ]
    expect(imageFiles(files).map((f) => f.name)).toEqual(['page1.webp', 'page2.PNG', 'page10.jpg'])
  })

  it('traite 2 éléments à la fois, dans l’ordre, sans s’arrêter sur une erreur', async () => {
    const started: number[] = []
    let running = 0
    let peak = 0
    await runQueue(
      [1, 2, 3, 4, 5],
      async (n) => {
        started.push(n)
        peak = Math.max(peak, ++running)
        await new Promise((r) => setTimeout(r, 5))
        running--
        if (n === 2) throw new Error('raté')
      },
      { concurrency: 2, isPaused: () => false },
    )
    expect(started).toEqual([1, 2, 3, 4, 5])
    expect(peak).toBe(2)
  })

  it('ne lance plus rien en pause, et termine ce qui est en cours', async () => {
    let paused = false
    const done: number[] = []
    await runQueue(
      [1, 2, 3, 4],
      async (n) => {
        if (n === 2) paused = true
        await new Promise((r) => setTimeout(r, 5))
        done.push(n)
      },
      { concurrency: 2, isPaused: () => paused },
    )
    expect(done.sort()).toEqual([1, 2])
    await runQueue([], async () => undefined, { concurrency: 2, isPaused: () => false })
  })

  describe('importOne', () => {
    function context(known: [string, string][] = []): BatchContext & { api: ReturnType<typeof fakeApi> } {
      return { api: fakeApi(), book: 'Pâtisserie maison', tags: ['dessert'], known: new Map(known) } as BatchContext & { api: ReturnType<typeof fakeApi> }
    }

    it('lit l’image et enregistre la recette avec le livre et la page lue', async () => {
      const ctx = context()
      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Tarte au citron', { page: '146', checks: [{ ingredient: 0, message: 'ignoré' }] }))
      ctx.api.recipes.saveRecipe.mockResolvedValue('r9')
      expect(await importOne(file('p146.jpg'), ctx)).toEqual({ status: 'done', recipes: [{ status: 'saved', title: 'Tarte au citron', recipeId: 'r9' }] })
      expect(ctx.api.recipes.importFromPhotos).toHaveBeenCalledWith([expect.any(Blob)], ['dessert'])
      expect(ctx.api.recipes.saveRecipe).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Tarte au citron', source: 'Pâtisserie maison', sourcePage: '146', servings: 4, tags: ['dessert'] }),
      )
      expect(ctx.known.get(recipeKey('Tarte au citron', 'Pâtisserie maison'))).toBe('r9')
    })

    it('ignore une page qui n’est pas une recette', async () => {
      const ctx = context()
      ctx.api.recipes.importFromPhotos.mockRejectedValue(new AppError('Aucune recette trouvée sur cette photo.', 'import-422'))
      expect(await importOne(file('sommaire.jpg'), ctx)).toEqual({ status: 'skipped', message: 'Pas une recette', recipes: [] })
    })

    it('saute une recette du même titre et du même livre, déjà enregistrée ou importée dans la série', async () => {
      const ctx = context([[recipeKey('tarte au citron', 'PATISSERIE MAISON'), 'r1']])
      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Tarte au Citron'))
      expect((await importOne(file('a.jpg'), ctx)).recipes).toEqual([{ status: 'duplicate', title: 'Tarte au Citron', recipeId: 'r1', message: 'Déjà enregistrée' }])
      expect(ctx.api.recipes.saveRecipe).not.toHaveBeenCalled()
    })

    it('enregistre une recette du même titre venant d’un autre livre ou sans livre', async () => {
      const ctx = context([
        [recipeKey('Tarte au citron', 'Ottolenghi'), 'r1'],
        [recipeKey('Tarte au citron', null), 'r2'],
      ])
      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Tarte au citron'))
      ctx.api.recipes.saveRecipe.mockResolvedValue('r3')
      expect((await importOne(file('a.jpg'), ctx)).recipes).toEqual([{ status: 'saved', title: 'Tarte au citron', recipeId: 'r3' }])
    })

    it('deux images du même titre lues en parallèle : une seule enregistrée', async () => {
      const ctx = context()
      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Crêpes'))
      let save: (id: string) => void = () => undefined
      ctx.api.recipes.saveRecipe.mockImplementation(() => new Promise<string>((r) => (save = r)))
      const first = importOne(file('a.jpg'), ctx)
      await vi.waitFor(() => expect(ctx.api.recipes.saveRecipe).toHaveBeenCalled())
      expect((await importOne(file('b.jpg'), ctx)).recipes).toMatchObject([{ status: 'duplicate', recipeId: undefined }])
      save('r5')
      expect((await first).recipes).toMatchObject([{ status: 'saved', recipeId: 'r5' }])
    })

    it('signale une recette incomplète sans l’enregistrer', async () => {
      const ctx = context()
      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Sauce', { ingredients: [{ name: 'beurre', quantity: null, unit: 'g', note: null, section: 'x'.repeat(81) }] }))
      expect((await importOne(file('a.jpg'), ctx)).recipes).toEqual([{ status: 'incomplete', title: 'Sauce', message: 'Titre trop long (80 caractères maximum)' }])
      expect(ctx.api.recipes.saveRecipe).not.toHaveBeenCalled()
    })

    it('enregistre chacune des recettes d’une page', async () => {
      const ctx = context([[recipeKey('Crêpes', 'Pâtisserie maison'), 'r1']])
      const page = read('Pâte brisée', { page: '12' })
      ctx.api.recipes.importFromPhotos.mockResolvedValue({ ...page, recipes: [page.recipe, read('Quiche', { page: '12' }).recipe, read('Crêpes').recipe] })
      ctx.api.recipes.saveRecipe.mockImplementation(async (input) => `id-${input.title}`)
      expect(await importOne(file('p12.jpg'), ctx)).toEqual({
        status: 'done',
        recipes: [
          { status: 'saved', title: 'Pâte brisée', recipeId: 'id-Pâte brisée' },
          { status: 'saved', title: 'Quiche', recipeId: 'id-Quiche' },
          { status: 'duplicate', title: 'Crêpes', recipeId: 'r1', message: 'Déjà enregistrée' },
        ],
      })
      expect(ctx.api.recipes.saveRecipe.mock.calls.map(([input]) => [input.title, input.sourcePage])).toEqual([
        ['Pâte brisée', '12'],
        ['Quiche', '12'],
      ])
    })

    it('signale les erreurs de lecture et d’enregistrement, et libère le titre', async () => {
      const ctx = context()
      vi.mocked(compressForReading).mockRejectedValueOnce(new Error('HEIC'))
      expect(await importOne(file('a.heic'), ctx)).toEqual({ status: 'error', message: 'Image illisible (essaie en JPEG ou PNG).', recipes: [] })

      ctx.api.recipes.importFromPhotos.mockRejectedValueOnce(new AppError('Le service d’analyse est surchargé.', 'import-503'))
      expect(await importOne(file('b.jpg'), ctx)).toEqual({ status: 'error', message: 'Le service d’analyse est surchargé.', recipes: [] })

      ctx.api.recipes.importFromPhotos.mockResolvedValue(read('Flan'))
      ctx.api.recipes.saveRecipe.mockRejectedValueOnce(new AppError('Connexion impossible.'))
      expect((await importOne(file('c.jpg'), ctx)).recipes).toEqual([{ status: 'error', title: 'Flan', message: 'Connexion impossible.' }])
      expect(ctx.known.has(recipeKey('Flan', 'Pâtisserie maison'))).toBe(false)
    })
  })
})

describe('réessai et décompte', () => {
  const saved = (title: string) => ({ status: 'saved' as const, title, recipeId: `id-${title}` })
  const failed = (title: string) => ({ status: 'error' as const, title, message: 'Connexion impossible.' })

  it('repère les images à relire', () => {
    expect(needsRetry({ status: 'error', recipes: [] })).toBe(true)
    expect(needsRetry({ status: 'done', recipes: [saved('A'), failed('B')] })).toBe(true)
    expect(needsRetry({ status: 'done', recipes: [saved('A')] })).toBe(false)
    expect(needsRetry({ status: 'skipped', recipes: [] })).toBe(false)
  })

  it('garde ce qui avait abouti quand une image est relue', () => {
    const previous = [saved('Pâte brisée'), failed('Quiche')]
    const next = { status: 'done' as const, recipes: [{ status: 'duplicate' as const, title: 'Pâte brisée', recipeId: 'id-Pâte brisée' }, saved('Quiche')] }
    expect(mergeRetry(previous, next)).toEqual({ status: 'done', recipes: [saved('Pâte brisée'), saved('Quiche')] })
    // Relecture en échec : le premier résultat reste, erreur comprise
    expect(mergeRetry(previous, { status: 'error', message: 'Réseau', recipes: [] })).toEqual({ status: 'done', recipes: previous })
    // Première lecture en échec : le nouveau résultat
    expect(mergeRetry([], { status: 'skipped', message: 'Pas une recette', recipes: [] })).toEqual({ status: 'skipped', message: 'Pas une recette', recipes: [] })
  })

  it('compte les recettes et les images sans recette', () => {
    expect(
      tally([
        { status: 'done', recipes: [saved('A'), saved('B'), { status: 'duplicate', title: 'C' }] },
        { status: 'done', recipes: [{ status: 'incomplete', title: 'D' }, failed('E')] },
        { status: 'skipped', recipes: [] },
        { status: 'error', recipes: [] },
        { status: 'pending', recipes: [] },
      ]),
    ).toEqual({ saved: 2, duplicate: 1, incomplete: 1, error: 2, skipped: 1 })
  })
})

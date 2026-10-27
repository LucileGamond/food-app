import { SHARED_PHOTOS_CACHE, takeSharedPhotos } from './sharedPhotos'

describe('takeSharedPhotos', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renvoie les photos rangées par le service worker, puis vide le cache', async () => {
    const stored = new Map<string, { blob: () => Promise<Blob> } | undefined>([
      ['https://food.exemple/photo-partagee/0', { blob: async () => new Blob(['a'], { type: 'image/png' }) }],
      ['https://food.exemple/photo-partagee/1', { blob: async () => new Blob(['b']) }],
      ['https://food.exemple/photo-partagee/2', undefined],
    ])
    const remove = vi.fn(async () => true)
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ keys: async () => [...stored.keys()], match: async (key: string) => stored.get(key) })),
      delete: remove,
    })
    const files = await takeSharedPhotos()
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['page-1', 'image/png'],
      ['page-2', 'image/jpeg'],
    ])
    expect(remove).toHaveBeenCalledWith(SHARED_PHOTOS_CACHE)
  })

  it('renvoie une liste vide sans Cache API, ou en cas d’erreur', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await takeSharedPhotos()).toEqual([])
    vi.stubGlobal('caches', { open: vi.fn(async () => Promise.reject(new Error('refusé'))) })
    expect(await takeSharedPhotos()).toEqual([])
  })
})

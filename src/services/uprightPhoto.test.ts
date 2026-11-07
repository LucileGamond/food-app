import { editImage } from '@/lib/image'
import { fakeApi } from '@/test/fakes'
import { detectRotation, straightenAllPhotos, uprightPhoto } from './uprightPhoto'

vi.mock('@/lib/image', () => ({
  compressImage: vi.fn(async (file: File) => new Blob([`réduite ${file.name}`], { type: 'image/jpeg' })),
  editImage: vi.fn(async (...args: unknown[]) => {
    const { rotation, maxSide } = (args[1] ?? {}) as { rotation?: number; maxSide?: number }
    return new File([`tournée ${rotation}`], maxSide ? `version-${rotation}.jpg` : `droite-${rotation}.jpg`, { type: 'image/jpeg' })
  }),
}))

const photo = () => new File(['plat'], 'plat.jpg', { type: 'image/jpeg' })

describe('photo remise à l’endroit', () => {
  beforeEach(() => vi.mocked(editImage).mockClear())

  it('soumet la photo tournée des 4 façons, réduite, dans l’ordre 0, 90, 180, 270°', async () => {
    const api = fakeApi()
    api.recipes.detectPhotoRotation.mockResolvedValue(270)
    expect(await detectRotation(api, photo())).toBe(270)
    const sent = api.recipes.detectPhotoRotation.mock.calls[0]![0] as File[]
    expect(sent.map((f) => f.name)).toEqual(['version-0.jpg', 'version-90.jpg', 'version-180.jpg', 'version-270.jpg'])
    expect(editImage).toHaveBeenCalledWith(expect.any(File), { rotation: 90, crop: { left: 0, top: 0, right: 1, bottom: 1 }, maxSide: 384 })
  })

  it('tourne la photo en pleine taille si besoin ; déjà droite ou en cas d’échec, la garde telle quelle', async () => {
    const api = fakeApi()
    api.recipes.detectPhotoRotation.mockResolvedValueOnce(90)
    expect((await uprightPhoto(api, photo())).name).toBe('droite-90.jpg')
    const original = photo()
    expect(await uprightPhoto(api, original)).toBe(original)
    api.recipes.detectPhotoRotation.mockRejectedValueOnce(new Error('réseau'))
    expect(await uprightPhoto(api, original)).toBe(original)
  })

  describe('toutes les photos des recettes', () => {
    const stored = [
      { id: 'p1', storage_path: 'r1/1.jpg', recipe_id: 'r1' },
      { id: 'p2', storage_path: 'r1/2.jpg', recipe_id: 'r1' },
      { id: 'p3', storage_path: 'r2/1.jpg', recipe_id: 'r2' },
    ]
    afterEach(() => vi.unstubAllGlobals())

    it('vérifie chaque photo et remplace à la même place celles de travers ; une photo inaccessible est comptée à part', async () => {
      const api = fakeApi()
      api.photos.listAllPhotos.mockResolvedValue(stored)
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => (url.endsWith('r1/2.jpg') ? new Response(null, { status: 404 }) : new Response(new Blob(['photo'])))),
      )
      api.recipes.detectPhotoRotation.mockResolvedValueOnce(180).mockResolvedValueOnce(0)
      const steps: number[] = []
      const result = await straightenAllPhotos(api, (p) => steps.push(p.done))
      expect(result).toEqual({ done: 3, total: 3, fixed: 1, failed: 1 })
      expect(steps).toEqual([0, 1, 2, 3])
      expect(fetch).toHaveBeenCalledWith('https://cdn.test/r1/1.jpg')
      expect(api.photos.replacePhoto).toHaveBeenCalledTimes(1)
      expect(api.photos.replacePhoto).toHaveBeenCalledWith(stored[0], expect.any(Blob))
    })

    it('s’arrête entre deux photos à la demande', async () => {
      const api = fakeApi()
      api.photos.listAllPhotos.mockResolvedValue(stored)
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['photo']))))
      let calls = 0
      const result = await straightenAllPhotos(api, () => undefined, () => ++calls > 1)
      expect(result).toMatchObject({ done: 1, total: 3 })
    })
  })
})

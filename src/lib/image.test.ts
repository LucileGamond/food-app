import imageCompression from 'browser-image-compression'
import { cropImage } from './image'

vi.mock('browser-image-compression', () => ({ default: vi.fn(async (file: File) => new Blob([`réduite ${file.name}`], { type: 'image/jpeg' })) }))

describe('recadrage de la photo du plat', () => {
  const drawImage = vi.fn()
  const close = vi.fn()
  let toBlob: (cb: (b: Blob | null) => void) => void

  beforeEach(() => {
    drawImage.mockClear()
    toBlob = (cb) => cb(new Blob(['jpeg'], { type: 'image/jpeg' }))
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1000, height: 2000, close })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext'])
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      toBlob(cb)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('découpe le cadre dans l’image d’origine, puis réduit la photo', async () => {
    const photo = await cropImage(new Blob(['page']), { left: 0.1, top: 0.25, right: 0.9, bottom: 0.75 })
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 500, 800, 1000, 0, 0, 800, 1000)
    expect(close).toHaveBeenCalled()
    expect(imageCompression).toHaveBeenCalledWith(expect.objectContaining({ name: 'photo-du-plat.jpg', type: 'image/jpeg' }), expect.anything())
    expect(photo).toBeInstanceOf(File)
    expect(photo.name).toBe('photo-du-plat.jpg')
    expect(photo.type).toBe('image/jpeg')
  })

  it('échoue si le navigateur ne sait pas produire l’image', async () => {
    toBlob = (cb) => cb(null)
    await expect(cropImage(new Blob(['page']), { left: 0, top: 0, right: 1, bottom: 1 })).rejects.toThrow('Recadrage impossible.')
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    await expect(cropImage(new Blob(['page']), { left: 0, top: 0, right: 1, bottom: 1 })).rejects.toThrow('Recadrage impossible.')
  })
})

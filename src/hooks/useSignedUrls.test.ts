import { act, renderHook, waitFor } from '@testing-library/react'
import type { Api } from '@/api'
import { fakeApi } from '@/test/fakes'
import { SIGNED_URLS_REFRESH_MS, useSignedUrls } from './useSignedUrls'

// Laisse les promesses se résoudre (les minuteurs sont simulés, waitFor ne peut pas attendre).
const flush = () => act(async () => {
  await Promise.resolve()
})

describe('useSignedUrls', () => {
  afterEach(() => vi.useRealTimers())

  it('renouvelle les liens avant leur expiration, et au retour au premier plan', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const api = fakeApi()
    let version = 0
    api.photos.signedUrls.mockImplementation(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}?v${++version}`])))
    const { result } = renderHook(() => useSignedUrls(api as unknown as Api, ['r/a.jpg']))
    await flush()
    expect(result.current['r/a.jpg']).toBe('https://cdn.test/r/a.jpg?v1')

    // Pas encore expiré : rien de redemandé, même au retour au premier plan
    act(() => {
      vi.advanceTimersByTime(10 * 60_000)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(api.photos.signedUrls).toHaveBeenCalledTimes(1)

    // Bientôt expiré : renouvelé
    act(() => {
      vi.advanceTimersByTime(SIGNED_URLS_REFRESH_MS)
    })
    await flush()
    expect(result.current['r/a.jpg']).toBe('https://cdn.test/r/a.jpg?v2')

    // Application en arrière-plan pendant des heures : renouvelé dès son retour
    vi.setSystemTime(Date.now() + 3 * 3600_000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()
    expect(result.current['r/a.jpg']).toBe('https://cdn.test/r/a.jpg?v3')
  })

  it('ne demande rien sans photo, et laisse les photos vides en cas d’erreur', async () => {
    const api = fakeApi()
    const { result, rerender } = renderHook(({ paths }) => useSignedUrls(api as unknown as Api, paths), { initialProps: { paths: [] as string[] } })
    expect(result.current).toEqual({})
    expect(api.photos.signedUrls).not.toHaveBeenCalled()
    api.photos.signedUrls.mockRejectedValueOnce(new Error('hors ligne'))
    rerender({ paths: ['r/b.jpg'] })
    await waitFor(() => expect(api.photos.signedUrls).toHaveBeenCalled())
    expect(result.current).toEqual({})
  })
})

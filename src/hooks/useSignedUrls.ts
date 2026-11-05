import { useEffect, useState } from 'react'

/** Les liens durent 1 h (src/api/photos.ts) : on les redemande un peu avant. */
export const SIGNED_URLS_REFRESH_MS = 50 * 60 * 1000

/**
 * URL temporaires des photos d'un bucket privé (`signedUrls` : fonction de l'api de ce bucket), renouvelées avant
 * expiration et au retour au premier plan (application restée ouverte en arrière-plan). Les échecs laissent simplement les photos vides.
 */
export function useSignedUrls(signedUrls: (paths: string[]) => Promise<Record<string, string>>, paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.join('|')

  useEffect(() => {
    if (key === '') {
      setUrls({})
      return
    }
    let active = true
    let fetchedAt = 0
    const load = () => {
      fetchedAt = Date.now()
      signedUrls(key.split('|')).then(
        (result) => active && setUrls(result),
        () => active && setUrls({}),
      )
    }
    const refreshIfStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt >= SIGNED_URLS_REFRESH_MS) load()
    }
    load()
    const timer = setInterval(refreshIfStale, 60_000)
    document.addEventListener('visibilitychange', refreshIfStale)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfStale)
    }
  }, [signedUrls, key])

  return urls
}

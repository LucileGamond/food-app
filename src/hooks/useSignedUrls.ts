import { useEffect, useState } from 'react'
import type { Api } from '@/api'

/** URL temporaires des photos (bucket privé). Les échecs laissent simplement les photos vides. */
export function useSignedUrls(api: Api, paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.join('|')

  useEffect(() => {
    if (key === '') {
      setUrls({})
      return
    }
    let active = true
    api.photos.signedUrls(key.split('|')).then(
      (result) => active && setUrls(result),
      () => active && setUrls({}),
    )
    return () => {
      active = false
    }
  }, [api, key])

  return urls
}

import { useEffect } from 'react'

/**
 * Recharge quand les données changent ailleurs (autre appareil, autre personne). Les modifications rapprochées
 * (plusieurs lignes d'un coup) ne déclenchent qu'un rechargement.
 */
export function useRealtimeReload(subscribe: (onChange: () => void) => () => void, reload: () => unknown, delayMs = 250) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), delayMs)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [subscribe, reload, delayMs])
}

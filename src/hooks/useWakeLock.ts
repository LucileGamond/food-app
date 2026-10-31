import { useEffect, useState } from 'react'

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

/**
 * Garde l'écran allumé tant que le composant est affiché (API Screen Wake Lock). Le navigateur relâche le verrou
 * quand l'onglet passe en arrière-plan : il est redemandé au retour. Renvoie false si le navigateur ne le permet pas.
 */
export function useWakeLock(): boolean {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let stopped = false

    const request = async () => {
      if (document.visibilityState !== 'visible' || sentinel) return
      try {
        const lock = await wakeLock.request('screen')
        if (stopped) return void lock.release().catch(() => undefined)
        sentinel = lock
        setActive(true)
        lock.addEventListener('release', () => {
          sentinel = null
          if (!stopped) setActive(false)
        })
      } catch {
        // Refusé (batterie faible, onglet caché…) : l'écran s'éteindra comme d'habitude.
        setActive(false)
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release().catch(() => undefined)
    }
  }, [wakeLock])

  return active
}

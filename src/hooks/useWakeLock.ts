import { useCallback, useEffect, useState } from 'react'

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

/** Choix « garder l'écran allumé », commun aux pages qui le proposent (recette, tricot). */
const PREFERENCE_KEY = 'life:ecran-allume'

function readPreference(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== 'non'
  } catch {
    return true
  }
}

function writePreference(on: boolean) {
  try {
    if (on) localStorage.removeItem(PREFERENCE_KEY)
    else localStorage.setItem(PREFERENCE_KEY, 'non')
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
  }
}

/**
 * Garde l'écran allumé tant que le composant est affiché et que `enabled` est vrai (API Screen Wake Lock). Le
 * navigateur relâche le verrou quand l'onglet passe en arrière-plan : il est redemandé au retour. Renvoie false si
 * le navigateur ne le permet pas ou si le verrou est relâché.
 */
export function useWakeLock(enabled = true): boolean {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!wakeLock || !enabled) return
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
      setActive(false)
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release().catch(() => undefined)
    }
  }, [wakeLock, enabled])

  return active
}

export interface ScreenAwake {
  /** Le navigateur sait garder l'écran allumé. */
  supported: boolean
  /** Choix de la personne (retenu sur ce téléphone). */
  enabled: boolean
  /** L'écran est effectivement maintenu allumé. */
  active: boolean
  setEnabled: (on: boolean) => void
}

/**
 * Écran allumé avec un interrupteur : le choix est retenu sur le téléphone, allumé par défaut. `inUse` à faux relâche
 * l'écran sans changer le choix (page affichée sans l'interrupteur).
 */
export function useScreenAwake(inUse = true): ScreenAwake {
  const supported = 'wakeLock' in navigator
  const [enabled, setEnabledState] = useState(readPreference)
  const active = useWakeLock(enabled && inUse)
  const setEnabled = useCallback((on: boolean) => {
    writePreference(on)
    setEnabledState(on)
  }, [])
  return { supported, enabled, active, setEnabled }
}

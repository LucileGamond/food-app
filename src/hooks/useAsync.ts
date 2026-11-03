import { useCallback, useEffect, useEffectEvent, useState, type DependencyList, type Dispatch, type SetStateAction } from 'react'
import { errorMessage } from '@/api'

export interface AsyncState<T> {
  /** `undefined` tant que rien n'est chargé ; la donnée précédente reste pendant un rechargement. */
  data: T | undefined
  error: string | null
  reload: () => void
  /** Mise à jour locale après une modification (avis enregistré…), sans recharger. */
  setData: Dispatch<SetStateAction<T | undefined>>
}

/**
 * Charge `load()` à l'affichage et quand `deps` changent ; `reload` relance (bouton « Réessayer »). Une réponse
 * dépassée (dépendances changées, rechargement, écran quitté) est ignorée.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const run = useEffectEvent(load)

  useEffect(() => {
    let active = true
    run().then(
      (value) => {
        if (!active) return
        setData(() => value)
        setError(null)
      },
      (e: unknown) => {
        if (active) setError(errorMessage(e))
      },
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépendances données par l'appelant
  }, [...deps, attempt])

  const reload = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { data, error, reload, setData }
}

import { useEffect } from 'react'

/** Tant que `active`, le navigateur demande avant de recharger ou de fermer la page (saisie non enregistrée). */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}

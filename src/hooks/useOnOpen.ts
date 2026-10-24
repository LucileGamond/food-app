import { useEffect, useRef } from 'react'

/**
 * Exécute `init` uniquement quand `open` passe de false à true.
 * Sert à préremplir un formulaire à l'ouverture sans écraser la saisie en cours
 * quand les données sous-jacentes sont rechargées (temps réel).
 */
export function useOnOpen(open: boolean, init: () => void): void {
  const latest = useRef(init)
  const wasOpen = useRef(false)

  useEffect(() => {
    latest.current = init
  })

  useEffect(() => {
    if (open && !wasOpen.current) latest.current()
    wasOpen.current = open
  }, [open])
}

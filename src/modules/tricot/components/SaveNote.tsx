// Règle du module Tricot : le texte libre s'enregistre tout seul (en quittant le champ) et le dit discrètement ; les
// nombres qui recalculent les étapes gardent un bouton « Enregistrer ». Ce petit mot est la moitié « le dit ».

import { Check, Loader2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved'

/** Suit un enregistrement automatique : « Enregistrement… » puis « Enregistré » (rien si ça rate, le toast le dit). */
export function useSaveNote() {
  const [state, setState] = useState<SaveState>('idle')
  const run = useCallback(async (save: () => Promise<unknown> | unknown) => {
    setState('saving')
    try {
      await save()
      setState('saved')
    } catch (error) {
      setState('idle')
      throw error
    }
  }, [])
  return { state, run, reset: useCallback(() => setState('idle'), []) }
}

/** « Enregistré », en petit, sous le champ qui vient de s'enregistrer seul. */
export function SaveNote({ state, className }: { state: SaveState; className?: string }) {
  return (
    // `aria-live` plutôt que `role="status"` : la zone reste en place pour être annoncée, sans ajouter un deuxième
    // « status » dans des panneaux qui en ont déjà un.
    <p aria-live="polite" className={cn('flex min-h-4 items-center gap-1 text-xs text-muted-foreground', className)}>
      {state === 'saving' && (
        <>
          <Loader2 className="size-3 animate-spin" aria-hidden /> Enregistrement…
        </>
      )}
      {state === 'saved' && (
        <>
          <Check className="size-3" aria-hidden /> Enregistré
        </>
      )}
    </p>
  )
}

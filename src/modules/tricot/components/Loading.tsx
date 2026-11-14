import { Loader2 } from 'lucide-react'

/** Chargement d'un écran ou d'une partie du module Tricot : le même spinner partout, nommé pour le lecteur d'écran. */
export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className ?? 'flex justify-center py-10'}>
      <Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
    </div>
  )
}

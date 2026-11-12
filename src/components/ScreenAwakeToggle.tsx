import { Sun, SunDim } from 'lucide-react'
import type { ScreenAwake } from '@/hooks/useWakeLock'
import { cn } from '@/lib/utils'

/** Interrupteur « Écran toujours allumé » ; rien si le navigateur ne sait pas garder l'écran allumé. */
/** `compact` : l'icône et l'interrupteur seuls (le libellé reste pour les lecteurs d'écran), pour un en-tête. */
export function ScreenAwakeToggle({ awake, className, compact = false }: { awake: ScreenAwake; className?: string; compact?: boolean }) {
  if (!awake.supported) return null
  const Icon = awake.enabled ? Sun : SunDim
  return (
    <button
      type="button"
      role="switch"
      aria-checked={awake.enabled}
      onClick={() => awake.setEnabled(!awake.enabled)}
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-full px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      <span aria-hidden className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', awake.enabled ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-background shadow transition-transform', awake.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      <Icon className="size-4" aria-hidden />
      <span className={cn(compact && 'sr-only')}>Écran toujours allumé</span>
    </button>
  )
}

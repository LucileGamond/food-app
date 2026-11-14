import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Les trois seuls encadrés du module : une explication, quelque chose à faire, un problème. */
export type NoteKind = 'info' | 'todo' | 'problem'

const STYLES: Record<NoteKind, { box: string; icon: typeof Info; tone: string }> = {
  info: { box: 'bg-muted/50', icon: Info, tone: 'text-muted-foreground' },
  todo: { box: 'border border-amber-500/40 bg-amber-500/10', icon: CircleAlert, tone: 'text-amber-700 dark:text-amber-400' },
  problem: { box: 'border border-destructive/40 bg-destructive/10', icon: TriangleAlert, tone: 'text-destructive' },
}

interface Props {
  kind?: NoteKind
  /** Rôle ARIA : « note » par défaut ; « status » ou « alert » quand ça vient d'arriver. */
  role?: 'note' | 'status' | 'alert'
  /** Titre court, en gras sur sa ligne (facultatif). */
  title?: ReactNode
  /** Identifiant du titre, quand un autre élément y renvoie (aria-describedby). */
  titleId?: string
  className?: string
  children: ReactNode
}

/** Encadré du module Tricot : même rayon, même icône et même ton pour un même rôle, partout. */
export function Note({ kind = 'info', role = 'note', title, titleId, className, children }: Props) {
  const { box, icon: Icon, tone } = STYLES[kind]
  const ownId = useId()
  const id = titleId ?? ownId
  return (
    <div role={role} aria-labelledby={title ? id : undefined} className={cn('space-y-1 rounded-xl p-3 text-sm', box, className)}>
      <p id={title ? id : undefined} className={cn('flex items-start gap-1.5', title && 'font-medium')}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} aria-hidden />
        <span className="min-w-0">{title ?? children}</span>
      </p>
      {title && <div className="pl-5.5">{children}</div>}
    </div>
  )
}

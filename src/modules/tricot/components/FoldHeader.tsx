import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  /** Ce qu'il y a dedans, affiché même replié (« 3 patrons »). */
  count?: string | null
  /** Bouton d'action à droite (« Ajouter au stock »). */
  action?: ReactNode
}

/** Titre d'une section repliable de la page Tricot : le titre ouvre ou referme la liste. */
export function FoldHeader({ id, title, open, onToggle, count, action }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={onToggle}
          className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronRight className={cn('size-4 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
          {title}
        </button>
        {count && <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>}
      </h2>
      {action}
    </div>
  )
}

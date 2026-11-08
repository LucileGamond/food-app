import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  title: ReactNode
  /** Bouton d'action à droite du titre (« Ajouter une laine »), affiché une fois la carte ouverte. */
  action?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

/** Carte repliable d'un projet (laine, patron adapté…) : repliée par défaut, le titre l'ouvre. */
export function PanelFold({ id, title, action, defaultOpen = false, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section aria-labelledby={id} className={cn('rounded-2xl border bg-background p-4 shadow-xs sm:p-5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="font-semibold">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-content`}
            onClick={() => setOpen((o) => !o)}
            className="-ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
            {title}
          </button>
        </h2>
        {open && action}
      </div>
      <div id={`${id}-content`} hidden={!open} className="mt-4 space-y-4">
        {children}
      </div>
    </section>
  )
}

import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** Identifiant du titre (la partie le nomme) ; son contenu prend `${id}-content`. */
  id: string
  title: ReactNode
  /** Ce qu'il y a dedans, en un mot, quand c'est replié (« 2 laines · échantillon noté »). */
  summary?: ReactNode
  /** Bouton d'action à droite du titre (« Ajouter une laine »), toujours visible. */
  action?: ReactNode
  /**
   * « card » : carte d'un projet ; « section » : partie d'une page (titre plus grand, sans carte) ; « sub » : partie
   * d'une carte (titre de la taille du texte, sans carte).
   */
  variant?: 'card' | 'section' | 'sub'
  defaultOpen?: boolean
  /** Ouverture gardée par la page (sinon elle l'est ici). */
  open?: boolean
  onToggle?: () => void
  className?: string
  children: ReactNode
}

/**
 * Bloc repliable du module Tricot : partout le même geste (le titre et son chevron ouvrent), le même résumé gris quand
 * c'est replié, et le bouton d'action toujours à droite.
 */
export function Fold({ id, title, summary, action, variant = 'card', defaultOpen = false, open, onToggle, className, children }: Props) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen)
  const isOpen = open ?? ownOpen
  const toggle = onToggle ?? (() => setOwnOpen((o) => !o))
  return (
    <section
      aria-labelledby={id}
      className={cn(variant === 'card' && 'rounded-2xl border bg-background p-4 shadow-xs sm:p-5', variant === 'section' && 'space-y-2', className)}
    >
      <div className="flex items-center gap-3">
        <h2 id={id} className={cn('min-w-0 flex-1', variant === 'section' ? 'text-lg font-semibold tracking-tight' : variant === 'sub' ? 'text-sm font-medium' : 'font-semibold')}>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`${id}-content`}
            onClick={toggle}
            className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')} aria-hidden />
            {title}
          </button>
        </h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* Le résumé a sa propre ligne : un bouton d'action ne doit jamais le rogner. */}
      {!isOpen && summary && <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>}
      <div id={`${id}-content`} hidden={!isOpen} className={cn(variant === 'card' && 'mt-4 space-y-4', variant === 'section' && 'space-y-3', variant === 'sub' && 'mt-1 space-y-2')}>
        {children}
      </div>
    </section>
  )
}

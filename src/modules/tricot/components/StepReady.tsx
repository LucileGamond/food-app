import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { ReadyIssue } from '../lib/ready'
import { Note } from './Note'

interface Props {
  issues: ReadyIssue[]
  /** Mode tricoter : lien vers la préparation de l'étape (absent dans la préparation elle-même). */
  setupTo?: string
  /** Préparation : ouvrir la sous-étape à corriger (son numéro, 0 = la première). */
  onFix?: (index: number) => void
}

/** Une ligne par sous-étape : son numéro, ce qui manque, puis la sous-étape elle-même. */
function Row({ issue, onFix }: { issue: ReadyIssue; onFix?: (index: number) => void }) {
  // Lue d'un trait au lecteur d'écran, montrée en deux lignes à l'œil.
  const inside: ReactNode = (
    <>
      <span className="sr-only">{issue.text}</span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-medium" aria-hidden>
        {issue.index + 1}
      </span>
      <span className="min-w-0 flex-1" aria-hidden>
        <span className="block font-medium">{issue.what}</span>
        <span className="block text-xs text-muted-foreground">{issue.section}</span>
      </span>
      {onFix && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  )
  const className = cn('flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left', onFix && 'hover:bg-amber-500/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none')
  return (
    <li>
      {onFix ? (
        <button type="button" onClick={() => onFix(issue.index)} className={className}>
          {inside}
        </button>
      ) : (
        <span className={className}>{inside}</span>
      )}
    </li>
  )
}

/**
 * Ce qu'il reste à préparer avant de tricoter (rien quand l'étape est prête).
 *
 * Dans la préparation, les sous-étapes sont juste en dessous avec leur propre encadré et leurs boutons : ici, seulement
 * le compte et de quoi y aller. Dans le mode tricoter, elles ne sont pas à l'écran : le détail est donné, sous-étape
 * par sous-étape.
 */
export function StepReady({ issues, setupTo, onFix }: Props) {
  // Prête : le bouton « Tricoter » actif le dit déjà
  if (issues.length === 0) return null
  const first = issues[0]!
  return (
    <Note kind="todo" role="alert" titleId="step-ready-title" title="À préparer avant de tricoter" className="space-y-1.5">
      {setupTo ? (
        <>
          <ul className="-mx-2 space-y-0.5">
            {issues.map((issue) => (
              <Row key={`${issue.index}-${issue.what}`} issue={issue} onFix={onFix} />
            ))}
          </ul>
          <Link to={setupTo} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            Préparer l’étape
          </Link>
        </>
      ) : (
        <>
          <p>
            {issues.length === 1 ? '1 chose à régler' : `${issues.length} choses à régler`}, signalée{issues.length > 1 ? 's' : ''} en orange dans les sous-étapes ci-dessous.
          </p>
          {onFix && (
            <button type="button" onClick={() => onFix(first.index)} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
              Aller à la première<span className="sr-only"> : {first.text}</span>
            </button>
          )}
        </>
      )}
    </Note>
  )
}

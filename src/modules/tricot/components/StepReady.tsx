import { ChevronRight, CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { ReadyIssue } from '../lib/ready'

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

/** Ce qu'il reste à préparer avant de tricoter, sous-étape par sous-étape (rien quand l'étape est prête). */
export function StepReady({ issues, setupTo, onFix }: Props) {
  // Prête : le bouton « Tricoter » actif le dit déjà
  if (issues.length === 0) return null
  return (
    <div role="alert" aria-labelledby="step-ready-title" className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p id="step-ready-title" className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden /> À préparer avant de tricoter
      </p>
      <ul className="space-y-0.5">
        {issues.map((issue) => (
          <Row key={`${issue.index}-${issue.what}`} issue={issue} onFix={onFix} />
        ))}
      </ul>
      {setupTo ? (
        <Link to={setupTo} className="inline-flex min-h-11 items-center px-2 font-medium underline underline-offset-4">
          Préparer l’étape
        </Link>
      ) : (
        <p className="px-2 text-xs text-muted-foreground">Touche une ligne pour corriger la sous-étape.</p>
      )}
    </div>
  )
}

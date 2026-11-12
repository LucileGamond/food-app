import { CircleAlert, CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReadyIssue } from '../lib/ready'

interface Props {
  issues: ReadyIssue[]
  /** Mode tricoter : lien vers la préparation de l'étape (absent dans la préparation elle-même). */
  setupTo?: string
}

/** Prête à tricoter, ou ce qu'il reste à préparer, sous-étape par sous-étape. */
export function StepReady({ issues, setupTo }: Props) {
  if (issues.length === 0) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-4" aria-hidden /> Prête à tricoter
      </p>
    )
  }
  return (
    <div role="alert" aria-labelledby="step-ready-title" className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p id="step-ready-title" className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden /> À préparer avant de tricoter
      </p>
      <ul className="list-inside list-disc space-y-0.5">
        {issues.map((issue) => (
          <li key={issue.index}>{issue.text}</li>
        ))}
      </ul>
      {setupTo ? (
        <Link to={setupTo} className="inline-block font-medium underline underline-offset-4">
          Préparer l’étape
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">Règle ces sous-étapes plus bas (Valider ou Régler) : le mode tricoter suivra ensuite rang par rang.</p>
      )}
    </div>
  )
}

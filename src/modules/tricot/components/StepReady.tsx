import { CircleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReadyIssue } from '../lib/ready'

interface Props {
  issues: ReadyIssue[]
  /** Mode tricoter : lien vers la préparation de l'étape (absent dans la préparation elle-même). */
  setupTo?: string
}

/** Ce qu'il reste à préparer avant de tricoter, sous-étape par sous-étape (rien quand l'étape est prête). */
export function StepReady({ issues, setupTo }: Props) {
  // Prête : le bouton « Tricoter » actif le dit déjà
  if (issues.length === 0) return null
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
        <p className="text-xs text-muted-foreground">Corrige-les plus bas : Valider ou Modifier.</p>
      )}
    </div>
  )
}

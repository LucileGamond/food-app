import { PartyPopper, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { KnitStep } from '../lib/pattern'
import { describePass } from '../lib/passes'
import type { ReadyIssue } from '../lib/ready'
import { StepReady } from './StepReady'

interface Props {
  /** Étape en cours (null : projet terminé ou sans étape). */
  step: Pick<KnitStep, 'title' | 'rowCount' | 'totalRows' | 'times' | 'pass'> | null
  /** Numéro de l'étape (1 = première) et nombre d'étapes. */
  number: number
  total: number
  /** Ce qui manque pour la tricoter (vide : prête). */
  issues: ReadyIssue[]
  /** Mode tricoter, et préparation de l'étape. */
  knitTo: string
  setupTo: string
}

/** Onglet Tricoter : l'étape en cours, son avancée et le bouton qui ouvre le mode tricoter (ou ce qu'il reste à préparer). */
export function CurrentStepCard({ step, number, total, issues, knitTo, setupTo }: Props) {
  if (!step) {
    return (
      <section role="status" className="rounded-2xl border border-brand/40 bg-brand/5 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <PartyPopper className="size-5 text-brand" aria-hidden /> {total ? 'Projet terminé' : 'Aucune étape à tricoter'}
        </p>
      </section>
    )
  }
  const rows = `${step.rowCount}${step.totalRows !== null ? ` / ${step.totalRows}` : ''} rang${(step.totalRows ?? step.rowCount) > 1 ? 's' : ''}`
  return (
    <section aria-labelledby="knit-current" className="space-y-3 rounded-2xl border bg-background p-4 shadow-xs">
      <div>
        <p className="text-xs text-muted-foreground">
          Étape {number} sur {total}
        </p>
        <h2 id="knit-current" className="text-lg font-semibold tracking-tight">
          {step.title}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">{[rows, describePass(step)].filter(Boolean).join(' · ')}</p>
      </div>
      {issues.length > 0 ? (
        <StepReady issues={issues} setupTo={setupTo} />
      ) : (
        <Link to={knitTo} className={cn(buttonVariants(), 'h-12 px-5 text-base')}>
          <Play /> Tricoter
        </Link>
      )}
    </section>
  )
}

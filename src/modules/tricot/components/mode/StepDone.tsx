import { Check, PartyPopper } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** Étape déjà marquée terminée. */
  done: boolean
  /** Étape suivante (null : dernière étape du projet). */
  next: string | null
  projectTo: string
  onFinish: () => void
}

/** Fin d'étape : tous les rangs sont faits ; on la termine (avec confirmation) pour passer à la suivante. */
export function StepDone({ done, next, projectTo, onFinish }: Props) {
  if (done && next === null) {
    return (
      <section role="status" className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
        <p className="flex items-center gap-2 text-xl font-semibold">
          <PartyPopper className="size-5 text-brand" aria-hidden /> Projet terminé
        </p>
        <Link to={projectTo} className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
          Retour au projet
        </Link>
      </section>
    )
  }
  return (
    <section role="status" className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
      <p className="text-xl font-semibold">{done ? 'Étape terminée' : 'Tous les rangs de l’étape sont faits'}</p>
      {!done && (
        <Button className="h-12 px-5" onClick={onFinish}>
          <Check /> Étape terminée
        </Button>
      )}
      {done && next && <p className="text-sm text-muted-foreground">Étape suivante : {next}</p>}
    </section>
  )
}

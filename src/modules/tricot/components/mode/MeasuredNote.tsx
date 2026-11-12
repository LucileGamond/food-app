import { Ruler } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StepSection } from '../../lib/pattern'

/** Des rangs de l'étape sont calculés depuis des cm (échantillon), pas encore vérifiés : le rappeler, avec le lien. */
export function MeasuredNote({ sections, setupTo }: { sections: StepSection[]; setupTo: string }) {
  if (!sections.some((s) => s.measured || s.at?.measured)) return null
  return (
    <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
      <Ruler className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      <span>
        Des rangs sont calculés depuis les cm du patron avec l’échantillon (≈) : à vérifier.{' '}
        <Link to={setupTo} className="font-medium underline underline-offset-4">
          Vérifier
        </Link>
      </span>
    </p>
  )
}

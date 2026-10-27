import { TriangleAlert } from 'lucide-react'

/** Point à vérifier après un import, affiché sous le champ concerné (orange : à relire, pas une erreur). */
export function CheckNote({ message }: { message: string }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="sr-only">À vérifier : </span>
        {message}
      </span>
    </p>
  )
}

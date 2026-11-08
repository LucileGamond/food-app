import { BookOpen } from 'lucide-react'
import { useBaseGlossary } from '../hooks/useBaseGlossary'
import { stepAbbreviations, type Abbreviation } from '../lib/glossary'

interface Props {
  text: string
  /** Traduction en français de l'étape, s'il y en a une. */
  translation?: string | null
  /** Abréviations expliquées par le patron (le glossaire de base complète). */
  abbreviations: Abbreviation[]
}

/** Rappel des abréviations de l'étape, replié : tout est là d'un coup d'œil, sans toucher chaque mot. */
export function StepAbbreviations({ text, translation = null, abbreviations }: Props) {
  const glossary = useBaseGlossary()
  const list = stepAbbreviations(text, translation, abbreviations, glossary)
  if (list.length === 0) return null
  return (
    <details className="rounded-xl bg-muted/40 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <BookOpen className="size-4 text-muted-foreground" aria-hidden /> Abréviations de l’étape
        <span className="font-normal text-muted-foreground">({list.length})</span>
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {list.map((a) => (
          <div key={a.abbr} className="contents">
            <dt className="font-semibold">{a.abbr}</dt>
            <dd className="text-muted-foreground">{a.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

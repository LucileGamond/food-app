import { BookOpen, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Abbreviation } from '../../lib/glossary'
import type { KnitStep } from '../../lib/pattern'
import type { Highlights } from '../../lib/sizes'
import { StepText } from '../SizedText'
import { StepAbbreviations } from '../StepAbbreviations'
import { StepNotes } from '../StepNotes'
import { StepQuestion } from '../StepQuestion'

interface Props {
  step: KnitStep
  /** Rang à tricoter (null : étape finie). */
  row: number | null
  size: string
  sizes: string[]
  sizeIndex: number | null
  abbreviations: Abbreviation[]
  onHighlights: (highlights: Highlights) => void
  onTranslate: () => Promise<void>
  onNotes: (notes: string) => void
  /** Terminer l'étape avant son dernier rang (nombre de rangs inconnu, ou fin anticipée). */
  onFinish: () => void
}

/** Volet « Patron », replié : le texte de l'étape, ses abréviations, une question sur le rang, les notes. */
export function PatternDrawer({ step, row, size, sizes, sizeIndex, abbreviations, onHighlights, onTranslate, onNotes, onFinish }: Props) {
  return (
    <details className="group rounded-2xl border bg-background">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-medium">
        <BookOpen className="size-4 text-muted-foreground" aria-hidden /> Patron
        <span className="text-sm font-normal text-muted-foreground">texte de l’étape, question, notes</span>
      </summary>
      <div className="space-y-4 border-t p-4">
        {step.instructions ? (
          <>
            <StepText
              text={step.instructions}
              sizes={sizes}
              sizeIndex={sizeIndex}
              highlights={step.highlights}
              onChange={onHighlights}
              abbreviations={abbreviations}
              translation={step.translation ?? null}
              onTranslate={onTranslate}
            />
            <StepAbbreviations text={step.instructions} translation={step.translation ?? null} abbreviations={abbreviations} />
            <StepQuestion key={step.id} stepTitle={step.title} text={step.translation || step.instructions} row={row} size={size} abbreviations={abbreviations} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pas de texte pour cette étape.</p>
        )}
        <StepNotes key={step.id} step={step} onSave={onNotes} />
        {!step.done && (
          <Button variant="outline" className="h-10" onClick={onFinish}>
            <Check /> Terminer l’étape maintenant
          </Button>
        )}
      </div>
    </details>
  )
}

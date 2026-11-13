import { BookOpen } from 'lucide-react'
import type { Abbreviation } from '../../lib/glossary'
import type { KnitStep } from '../../lib/pattern'
import type { Highlights } from '../../lib/sizes'
import { SizedText, StepText } from '../SizedText'
import { useBaseGlossary } from '../../hooks/useBaseGlossary'
import { looksEnglish, mergeGlossary } from '../../lib/glossary'
import { planSections, sectionIndicesAt } from '../../lib/pattern'
import { Fold } from '../Fold'
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
}

/** Volet « Patron », replié : le texte de l'étape, ses abréviations, une question sur le rang, les notes. */
export function PatternDrawer({ step, row, size, sizes, sizeIndex, abbreviations, onHighlights, onTranslate, onNotes }: Props) {
  const base = useBaseGlossary()
  // Paragraphe(s) des sous-étapes en cours : d'abord, le texte complet ensuite
  const current = row === null ? [] : sectionIndicesAt(planSections(step.sections, step.totalRows), row).flatMap((i) => (step.sections[i]?.source ? [step.sections[i]!.source!] : []))
  const glossary = mergeGlossary(abbreviations, base, looksEnglish(step.instructions))
  return (
    <Fold
      id="pattern-drawer"
      title={
        <>
          <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden /> Patron
        </>
      }
      summary="texte de l’étape, question, notes"
    >
      <div className="space-y-4">
        {current.length > 0 && (
          <section aria-label="Sous-étape en cours" className="space-y-2">
            {current.map((source, i) => (
              <SizedText key={i} text={source} sizes={sizes} sizeIndex={sizeIndex} glossary={glossary} className="rounded-lg bg-brand/5 px-3 py-2" />
            ))}
          </section>
        )}
        {step.instructions ? (
          <>
            {current.length > 0 && <p className="text-xs font-medium text-muted-foreground">Texte complet de l’étape</p>}
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
            <StepQuestion key={step.id} stepTitle={step.title} text={step.translation || step.instructions} row={row} size={size} abbreviations={abbreviations} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pas de texte pour cette étape.</p>
        )}
        <StepNotes key={step.id} step={step} onSave={onNotes} />
      </div>
    </Fold>
  )
}

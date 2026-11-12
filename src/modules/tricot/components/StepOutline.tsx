import { Check, ListTree } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { describeEvent } from '../lib/guide'
import { outlineIndicesAt, stepOutline, type OutlineRow, type OutlineSection } from '../lib/outline'
import type { StepSection } from '../lib/pattern'
import type { StitchCount } from '../lib/stitches'

interface Props {
  step: { sections: StepSection[]; totalRows: number | null; stitches: number | null; rowCount: number }
  /** Étape suivante (null : dernière étape). */
  nextTitle: string | null
  /** Repère du rang en cours (faux : étape finie, ou préparation sans rang en cours). */
  showCurrent?: boolean
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « → 58 mailles », « → 58 (?) mailles ». */
function stitchesText(count: StitchCount | null): string | null {
  if (!count || count.kind === 'unknown') return null
  return `→ ${count.stitches}${count.kind === 'estimate' ? ' (?)' : ''} maille${count.stitches > 1 ? 's' : ''}`
}

function Row({ item, current }: { item: OutlineRow; current: number | null }) {
  const done = current !== null && item.row < current
  const here = item.row === current
  const stitches = stitchesText(item.stitches)
  return (
    <li aria-current={here ? 'step' : undefined} className={cn('flex gap-2 rounded-lg px-2 py-1', here && 'bg-brand/10 font-medium', done && 'text-muted-foreground')}>
      <span className="w-16 shrink-0 tabular-nums">
        {done && <Check className="mr-0.5 inline size-3.5" aria-label="Fait" />}
        Rang {item.row}
      </span>
      <span className="min-w-0">
        {item.events.map(describeEvent).join(' · ')}
        {stitches && <span className="text-muted-foreground tabular-nums"> {stitches}</span>}
        {here && <span className="ml-1 rounded-full bg-brand/15 px-1.5 text-xs">à tricoter</span>}
      </span>
    </li>
  )
}

function Section({ section, current, isCurrent }: { section: OutlineSection; current: number | null; isCurrent: boolean }) {
  const done = current !== null && section.end !== null && !section.cut && section.end < current
  return (
    <li aria-current={isCurrent ? 'step' : undefined} className={cn('space-y-1 rounded-xl border px-3 py-2', isCurrent ? 'border-brand bg-brand/5' : 'bg-background', done && 'text-muted-foreground')}>
      <p className={cn(!done && 'font-medium')}>{section.title ?? 'Fin de l’étape'}</p>
      <p className="text-xs text-muted-foreground">
        {section.toSet
          ? 'À régler en rangs dans la préparation : la suite se calculera.'
          : section.start === null
            ? 'Rangs pas encore connus (une section avant est à régler).'
            : [section.range, section.quiet > 0 && `${plural(section.quiet, 'rang')} sans rien de particulier`].filter(Boolean).join(' · ')}
      </p>
      {section.rows.length > 0 && (
        <ol className="space-y-0.5 text-sm" aria-label={section.title ?? 'Fin de l’étape'}>
          {section.rows.map((item) => (
            <Row key={item.row} item={item} current={current} />
          ))}
        </ol>
      )}
      {section.cut && <p className="text-xs text-muted-foreground">…et ainsi de suite jusqu’à la fin de l’étape.</p>}
    </li>
  )
}

/** L'étape entière, section par section, avec les rangs où il y a quelque chose à faire ; repliée. */
export function StepOutline({ step, nextTitle, showCurrent = true }: Props) {
  const ref = useRef<HTMLDetailsElement>(null)
  const outline = stepOutline(step, nextTitle)
  const current = showCurrent ? step.rowCount + 1 : null
  const currentIndices = current === null ? [] : outlineIndicesAt(outline, current)

  // À l'ouverture : le rang en cours (ou sa section) en vue.
  function onToggle() {
    if (!ref.current?.open) return
    ref.current.querySelector('li li[aria-current], li[aria-current]')?.scrollIntoView?.({ block: 'center' })
  }

  return (
    <details ref={ref} onToggle={onToggle} className="group rounded-2xl border bg-background">
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-medium">
        <ListTree className="size-4 text-muted-foreground" aria-hidden /> Toute l’étape
        <span className="text-sm font-normal text-muted-foreground">sections et rangs</span>
      </summary>
      <div className="border-t p-3">
        {outline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Rien de prévu : ajoute des sections ou le nombre de rangs de l’étape dans la préparation.</p>
        ) : (
          <ol className="space-y-2 text-sm" aria-label="Toute l’étape">
            {outline.map((section, i) => (
              <Section key={i} section={section} current={current} isCurrent={currentIndices.includes(i)} />
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}

import { Check, Highlighter, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { highlightKey, highlightParts, toggleHighlight, type HighlightPart, type Highlights } from '../lib/sizes'

interface Props {
  text: string
  /** Tailles du patron, et celle dont les nombres sont mis en valeur (null : seulement les corrections « none »). */
  sizes: string[]
  sizeIndex: number | null
  /** Corrections faites à la main. */
  highlights?: Highlights
  /** Mode correction : chaque nombre devient un bouton qui le surligne ou non. */
  onToggle?: (part: HighlightPart, found: HighlightPart['state']) => void
  className?: string
}

const CHOSEN = 'rounded bg-brand/15 px-0.5 font-semibold text-foreground'

/** Texte du patron recopié tel quel : nombres de la taille choisie surlignés, ceux des autres tailles estompés. */
export function SizedText({ text, sizes, sizeIndex, highlights = {}, onToggle, className }: Props) {
  const parts = highlightParts(text, sizes.length, sizeIndex, highlights)
  // Surlignage calculé, sans corrections : sert à savoir si une correction revient au calcul.
  const found = onToggle ? highlightParts(text, sizes.length, sizeIndex) : parts
  return (
    <p className={cn('text-sm whitespace-pre-line', onToggle && 'leading-7', className)}>
      {parts.map((part, i) => {
        if (part.kind === 'text') return part.text
        if (onToggle) {
          return (
            <button
              key={i}
              type="button"
              aria-pressed={part.state === 'chosen'}
              aria-label={`${part.text}${part.state === 'chosen' ? ', surligné' : ''}`}
              onClick={() => onToggle(part, found[i]!.state)}
              className={cn(
                'rounded px-0.5 underline decoration-dotted underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                part.state === 'chosen' ? CHOSEN : part.state === 'other' ? 'text-muted-foreground' : 'hover:bg-muted',
              )}
            >
              {part.text}
            </button>
          )
        }
        if (part.state === 'chosen')
          return (
            <mark key={i} className={CHOSEN}>
              {part.text}
            </mark>
          )
        return part.state === 'other' ? (
          <span key={i} className="text-muted-foreground">
            {part.text}
          </span>
        ) : (
          part.text
        )
      })}
    </p>
  )
}

interface StepTextProps {
  text: string
  sizes: string[]
  sizeIndex: number | null
  highlights: Highlights
  /** Corrections modifiées (enregistrées avec l'étape). */
  onChange: (highlights: Highlights) => void
}

/** Texte d'une étape, avec la correction du surlignage nombre par nombre. */
export function StepText({ text, sizes, sizeIndex, highlights, onChange }: StepTextProps) {
  const [editing, setEditing] = useState(false)
  const fixed = Object.keys(highlights[highlightKey(sizeIndex)] ?? {}).length > 0
  return (
    <div className="space-y-2">
      <SizedText
        text={text}
        sizes={sizes}
        sizeIndex={sizeIndex}
        highlights={highlights}
        onToggle={editing ? (part, found) => onChange(toggleHighlight(highlights, sizeIndex, part, found)) : undefined}
      />
      {editing && <p className="text-xs text-muted-foreground">Touche un nombre pour le surligner ou retirer son surlignage.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={editing ? 'default' : 'outline'} size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? <Check /> : <Highlighter />}
          {editing ? 'Terminé' : 'Corriger le surlignage'}
        </Button>
        {editing && fixed && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const rest = { ...highlights }
              delete rest[highlightKey(sizeIndex)]
              onChange(rest)
            }}
          >
            <Undo2 /> Annuler mes corrections
          </Button>
        )}
      </div>
    </div>
  )
}

interface PickerProps {
  id: string
  sizes: string[]
  sizeIndex: number | null
  onChange: (sizeIndex: number | null) => void
  disabled?: boolean
}

/** Choix de la taille dont les nombres sont mis en valeur (ou aucune). */
export function SizePicker({ id, sizes, sizeIndex, onChange, disabled }: PickerProps) {
  if (sizes.length < 2) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        Nombres de la taille
      </label>
      <NativeSelect id={id} className="w-auto" value={sizeIndex ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">Aucune</option>
        {sizes.map((s, i) => (
          <option key={i} value={i}>
            {s}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

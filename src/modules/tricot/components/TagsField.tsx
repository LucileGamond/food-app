import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addTag, MAX_PATTERN_TAGS, MAX_TAG_LENGTH } from '../lib/library'

/** Suggestions montrées au plus : les étiquettes les plus employées de la bibliothèque. */
const MAX_SUGGESTIONS = 8

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  /** Étiquettes déjà employées dans la bibliothèque, les plus fréquentes d'abord. */
  suggestions: string[]
}

/** Étiquettes libres d'un patron : saisie (Entrée ou virgule), suggestions d'un toucher, croix pour retirer. */
export function TagsField({ tags, onChange, suggestions }: Props) {
  const [text, setText] = useState('')
  const full = tags.length >= MAX_PATTERN_TAGS
  const offered = suggestions.filter((s) => !tags.includes(s)).slice(0, MAX_SUGGESTIONS)

  function add(value: string) {
    onChange(addTag(tags, value))
    setText('')
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="pattern-tags">Étiquettes</Label>
      {tags.length > 0 && (
        <ul aria-label="Étiquettes du patron" className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-muted py-0.5 pr-0.5 pl-2.5 text-sm">
              {tag}
              <button
                type="button"
                aria-label={`Retirer l’étiquette ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="inline-flex size-6 items-center justify-center rounded-full hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && (
        <div className="flex gap-2">
          <Input
            id="pattern-tags"
            className="h-10 min-w-0 flex-1"
            maxLength={MAX_TAG_LENGTH}
            value={text}
            placeholder="pull, bébé, cadeau…"
            onChange={(e) => {
              // Une virgule termine l'étiquette, comme Entrée.
              if (e.target.value.includes(',')) return add(e.target.value.replaceAll(',', ''))
              setText(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              add(text)
            }}
          />
          <Button type="button" variant="outline" className="h-10 shrink-0" disabled={!text.trim()} onClick={() => add(text)}>
            <Plus /> Ajouter
          </Button>
        </div>
      )}
      {!full && offered.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Étiquettes déjà employées" role="group">
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-full border border-dashed px-2.5 py-0.5 text-sm text-muted-foreground hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

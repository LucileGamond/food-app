import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { normalizeTags } from '@/lib/recipes'

interface Props {
  id?: string
  value: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}

/** Saisie de tags : Entrée ou virgule pour valider, suggestions issues des tags existants. */
export function TagInput({ id, value, suggestions, onChange }: Props) {
  const [draft, setDraft] = useState('')
  const listId = useId()
  const lower = new Set(value.map((t) => t.toLocaleLowerCase('fr-FR')))
  const available = suggestions.filter((s) => !lower.has(s.toLocaleLowerCase('fr-FR')))

  function commit(raw: string) {
    const next = normalizeTags([...value, ...raw.split(',')])
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags choisis">
          {value.map((tag) => (
            <li key={tag} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted pr-1 pl-3 text-sm">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`Retirer le tag ${tag}`}
                className="flex size-5 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        list={listId}
        placeholder="Ajouter un tag puis Entrée"
        onChange={(e) => {
          const text = e.target.value
          if (available.some((s) => s === text)) commit(text)
          else setDraft(text)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        className="h-10"
      />
      <datalist id={listId}>
        {available.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}

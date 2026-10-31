import { Check, Plus } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { filterSources, findSource } from '@/lib/sources'
import { cn } from '@/lib/utils'

interface Props {
  id: string
  value: string
  /** Sources existantes, déjà regroupées. */
  sources: readonly string[]
  onChange: (source: string) => void
  placeholder?: string
  invalid?: boolean
  className?: string
}

type Option = { kind: 'existing'; label: string } | { kind: 'create'; label: string }

/**
 * Livre ou source : liste des sources existantes filtrée par la saisie, ou « Créer « … » » pour une nouvelle. Un
 * texte qui ne diffère d'une source existante que par la casse ou les accents prend son écriture (pas de doublon).
 */
export function SourceInput({ id, value, sources, onChange, placeholder, invalid, className }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const text = value.trim()
  const existing = findSource(text, sources)
  const options: Option[] = [
    // Source déjà choisie : toutes les sources, pour en changer.
    ...filterSources(existing === value ? '' : text, sources).map((label) => ({ kind: 'existing' as const, label })),
    ...(text && !existing ? [{ kind: 'create' as const, label: text }] : []),
  ]
  const shown = open && options.length > 0
  const current = Math.min(active, options.length - 1)

  function choose(option: Option) {
    onChange(option.label)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + options.length) % options.length)
    } else if (event.key === 'Enter' && shown) {
      event.preventDefault()
      choose(options[current]!)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${current}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={value}
        maxLength={200}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          // Même source à la casse ou aux accents près : l'écriture existante.
          if (existing && existing !== value) onChange(existing)
        }}
        onKeyDown={handleKeyDown}
        className={cn('h-10', className)}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sources"
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {options.map((option, i) => (
            <li
              key={`${option.kind}-${option.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              // Avant le blur du champ : le choix est pris en compte.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              onMouseMove={() => i !== current && setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-2', i === current && 'bg-muted')}
            >
              {option.kind === 'create' ? (
                <>
                  <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">Créer « {option.label} »</span>
                </>
              ) : (
                <>
                  <Check className={cn('size-4 shrink-0', option.label === existing ? 'text-brand' : 'invisible')} aria-hidden />
                  <span className="min-w-0 truncate">{option.label}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

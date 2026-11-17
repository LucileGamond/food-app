import { cn } from '@/lib/utils'

interface Props<T extends string> {
  /** Nom du groupe, lu par les lecteurs d'écran. */
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** Choix exclusif en segments côte à côte (« Rangs sans répétition | Répétition »). */
export function SegmentedRadio<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('rounded-md px-2 py-1.5 text-sm', value === option.value ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

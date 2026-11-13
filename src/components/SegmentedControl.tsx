import { cn } from '@/lib/utils'

interface Props<T extends string> {
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}

/** Choix exclusif entre quelques options côte à côte (filtre d'une liste, vue d'un écran). */
export function SegmentedControl<T extends string>({ label, value, options, onChange, className }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 min-w-0 flex-auto truncate rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            value === option.value && 'bg-background text-foreground shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

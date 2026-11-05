import { cn } from '@/lib/utils'
import { MONTH_NAMES, MONTH_SHORT } from '../lib/format'

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

interface Props {
  value: number[]
  onChange: (months: number[]) => void
  invalid?: boolean
  labelledBy: string
}

/** Mois en pastilles, avec le raccourci « Toute l’année ». */
export function MonthPicker({ value, onChange, invalid, labelledBy }: Props) {
  const selected = new Set(value)
  const toggle = (month: number) => onChange(selected.has(month) ? value.filter((m) => m !== month) : [...value, month].sort((a, b) => a - b))
  const allYear = selected.size === 12

  return (
    <div className="space-y-2">
      <div role="group" aria-labelledby={labelledBy} aria-invalid={invalid || undefined} className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {ALL.map((month) => (
          <button
            key={month}
            type="button"
            aria-pressed={selected.has(month)}
            aria-label={MONTH_NAMES[month - 1]}
            onClick={() => toggle(month)}
            className={cn(
              'h-9 rounded-md border text-xs font-medium transition-colors',
              selected.has(month) ? 'border-brand bg-brand text-white dark:text-background' : 'bg-background text-muted-foreground hover:text-foreground',
              invalid && !selected.has(month) && 'border-destructive/50',
            )}
          >
            {MONTH_SHORT[month - 1]}
          </button>
        ))}
      </div>
      <button type="button" className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => onChange(allYear ? [] : ALL)}>
        {allYear ? 'Tout désélectionner' : 'Toute l’année'}
      </button>
    </div>
  )
}

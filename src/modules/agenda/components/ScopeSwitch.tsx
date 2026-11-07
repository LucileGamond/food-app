import type { AgendaScope } from '@agenda/scope.ts'
import { cn } from '@/lib/utils'
import { scopeOptions } from '../lib/agenda'

/** Agendas affichés : « Moi », celui de l'autre, « Les deux ». */
export function ScopeSwitch({ value, otherName, onChange, disabled, className }: { value: AgendaScope; otherName: string; onChange: (scope: AgendaScope) => void; disabled?: boolean; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Agendas affichés" className={cn('inline-flex rounded-lg bg-muted p-0.5', className)}>
      {scopeOptions(otherName).map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 min-w-0 flex-auto truncate rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60',
            value === option.value && 'bg-background text-foreground shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

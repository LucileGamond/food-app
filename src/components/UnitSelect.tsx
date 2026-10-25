import { isUnit, UNIT_GROUPS } from '@/lib/units'
import { cn } from '@/lib/utils'

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30'

interface Props {
  value: string
  onChange: (unit: string) => void
  id?: string
  'aria-label'?: string
  className?: string
  disabled?: boolean
}

/** Choix d'une unité dans la liste fermée (« — » : sans unité). */
export function UnitSelect({ value, onChange, id, className, disabled, ...rest }: Props) {
  return (
    <select
      id={id}
      aria-label={rest['aria-label']}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(selectClass, value === '' && 'text-muted-foreground', className)}
    >
      <option value="">—</option>
      {/* Unité d'une ancienne saisie hors liste : affichée pour ne pas la perdre, signalée à l'enregistrement. */}
      {value !== '' && !isUnit(value) && <option value={value}>{value}</option>}
      {UNIT_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

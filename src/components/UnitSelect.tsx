import { isUnit, UNIT_GROUPS } from '@/lib/units'
import { cn } from '@/lib/utils'
import { NativeSelect } from '@/components/ui/native-select'

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
    <NativeSelect
      id={id}
      aria-label={rest['aria-label']}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn('w-full px-2', value === '' && 'text-muted-foreground', className)}
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
    </NativeSelect>
  )
}

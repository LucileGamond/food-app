import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SERVINGS_MAX } from '@/lib/recipes'
import { cn } from '@/lib/utils'

/** Nombre de personnes, de 1 à `SERVINGS_MAX` ; `large` : boutons du mode cuisine, à toucher les mains occupées. */
export function ServingsStepper({ value, onChange, large = false }: { value: number; onChange: (value: number) => void; large?: boolean }) {
  const size = large ? 'icon-lg' : 'icon'
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Nombre de personnes">
      <Button variant="outline" size={size} aria-label="Une personne de moins" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus />
      </Button>
      <span className={cn('min-w-24 text-center tabular-nums', !large && 'text-sm')} aria-live="polite">
        {value} {value > 1 ? 'personnes' : 'personne'}
      </span>
      <Button variant="outline" size={size} aria-label="Une personne de plus" disabled={value >= SERVINGS_MAX} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
  )
}

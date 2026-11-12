import { Repeat } from 'lucide-react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { StepProgress } from '../api'
import type { KnitStep } from '../lib/pattern'
import { MAX_STEP_TIMES, ordinal, withTimes } from '../lib/passes'

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** Nombre de fois où l'étape se tricote (les deux manches), et la fois en cours. */
export function StepTimes({ step, onChange }: { step: Pick<KnitStep, 'times' | 'pass'>; onChange: (progress: StepProgress) => void }) {
  const id = useId()
  return (
    <section aria-label="Nombre de fois" className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-times`} className="flex items-center gap-1.5">
            <Repeat className="size-4" aria-hidden /> À tricoter
          </Label>
          <NativeSelect id={`${id}-times`} className="w-28" value={step.times} onChange={(e) => onChange(withTimes(step, Number(e.target.value)))}>
            {range(MAX_STEP_TIMES).map((n) => (
              <option key={n} value={n}>
                {n} fois
              </option>
            ))}
          </NativeSelect>
        </div>
        {step.times > 1 && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-pass`}>En cours</Label>
            <NativeSelect id={`${id}-pass`} className="w-28" value={step.pass} onChange={(e) => onChange({ pass: Number(e.target.value) })}>
              {range(step.times).map((n) => (
                <option key={n} value={n}>
                  {ordinal(n)} fois
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {step.times > 1
          ? `Le compteur est celui de la ${ordinal(step.pass)} fois ; il repart au rang 1 pour la suivante.`
          : 'Ex. 2 pour les deux manches : le mode tricoter enchaîne la 2e fois, compteur à 0.'}
      </p>
    </section>
  )
}

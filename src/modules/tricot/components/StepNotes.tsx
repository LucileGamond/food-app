import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { KnitStep } from '../lib/pattern'

/** Notes d'une étape (aiguilles, essais…), enregistrées en quittant le champ. */
export function StepNotes({ step, onSave }: { step: Pick<KnitStep, 'id' | 'notes'>; onSave: (notes: string) => void }) {
  const [value, setValue] = useState(step.notes)
  const id = `notes-${step.id}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Notes</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={5000}
        placeholder="Aiguilles, essais, modifications…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== step.notes && onSave(value)}
      />
    </div>
  )
}

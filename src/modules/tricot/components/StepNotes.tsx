import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { KnitStep } from '../lib/pattern'
import { SaveNote, useSaveNote } from './SaveNote'

/** Notes d'une étape (aiguilles, essais…), enregistrées en quittant le champ, et qui le disent. */
export function StepNotes({ step, onSave, hideLabel = false }: { step: Pick<KnitStep, 'id' | 'notes'>; onSave: (notes: string) => Promise<unknown> | unknown; hideLabel?: boolean }) {
  const [value, setValue] = useState(step.notes)
  const saved = useSaveNote()
  const id = `notes-${step.id}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        Notes de l’étape
      </Label>
      <Textarea
        id={id}
        value={value}
        maxLength={5000}
        placeholder="Aiguilles, essais, modifications…"
        onChange={(e) => {
          setValue(e.target.value)
          saved.reset()
        }}
        onBlur={() => value !== step.notes && void saved.run(() => onSave(value))}
      />
      <SaveNote state={saved.state} />
    </div>
  )
}

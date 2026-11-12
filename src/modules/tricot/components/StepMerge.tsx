import { Combine } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { mergeBlocker } from '../lib/merge'
import type { KnitStep } from '../lib/pattern'

interface Props {
  next: Pick<KnitStep, 'title' | 'rowCount' | 'done' | 'pass'> | null
  /** Le projet a une adaptation (elle vise les étapes d'origine). */
  adapted: boolean
  onMerge: () => Promise<void>
}

/** Regrouper l'étape avec la suivante, qui devient ses sous-étapes (« Dos – côtes » + « Dos – jersey »). */
export function StepMerge({ next, adapted, onMerge }: Props) {
  const [confirming, setConfirming] = useState(false)
  if (!next) return null
  const blocker = mergeBlocker(next, adapted)
  return (
    <div className="space-y-1">
      <Button variant="outline" className="h-9" disabled={blocker !== null} onClick={() => setConfirming(true)}>
        <Combine /> Regrouper avec l’étape suivante
      </Button>
      {blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Regrouper avec l’étape suivante ?"
        description={`« ${next.title} » devient la suite de cette étape : ses sous-étapes, son texte, ses diagrammes et ses notes s’ajoutent ici.`}
        confirmLabel="Regrouper"
        onConfirm={onMerge}
      />
    </div>
  )
}

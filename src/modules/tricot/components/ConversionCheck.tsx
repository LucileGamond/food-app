import { Ruler } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DoneIcon, EditIcon } from './KnitIcons'
import { Note } from './Note'
import { describeConversion } from '../lib/measure'
import { formatNeedle } from '../lib/needles'
import type { StepSection } from '../lib/pattern'

export interface NeedleCheck {
  /** Aiguille de la sous-étape (null : aucune choisie). */
  needle: number | null
  /** Conversions de cette aiguille déjà vérifiées. */
  checked: boolean
}

interface Props {
  section: StepSection
  onValidate: () => void
  onEdit: () => void
  /** Vérification par aiguille (absente : la sous-étape se valide seule). */
  check?: NeedleCheck
}

/** Rangs calculés depuis une mesure du patron : le calcul, à vérifier puis valider (ou régler). */
export function ConversionCheck({ section, onValidate, onEdit, check }: Props) {
  const calculation = describeConversion(section)
  if (!calculation) return null
  if (check?.checked) {
    // Vérifié une fois pour l'aiguille : il suit son échantillon, sans redemander
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Ruler className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Converti : {calculation}. Vérifié pour {check.needle !== null ? `l’aiguille ${formatNeedle(check.needle)}` : 'ce projet'}.
        </span>
      </p>
    )
  }
  return (
    <Note kind="todo" title="Mesure à vérifier" className="mt-2">
      <p>
        Converti depuis le patron : {calculation} (arrondi).{' '}
        {check ? `Vérifie-le : valider vaut pour toutes les sous-étapes ${check.needle !== null ? `à l’aiguille ${formatNeedle(check.needle)}` : 'du projet'}.` : 'Vérifie ce nombre, puis valide-le ; il suit l’échantillon tant qu’il n’est pas validé.'}
      </p>
      {/* Libellés longs (« Valider pour l’aiguille 6 mm ») : ils passent à la ligne plutôt que de déborder. */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" className="h-auto min-h-10 max-w-full whitespace-normal text-left" onClick={onValidate}>
          <DoneIcon /> {check?.needle != null ? `Valider pour l’aiguille ${formatNeedle(check.needle)}` : 'Valider'}
        </Button>
        <Button type="button" variant="outline" className="h-auto min-h-10" onClick={onEdit}>
          <EditIcon /> Modifier
        </Button>
      </div>
    </Note>
  )
}

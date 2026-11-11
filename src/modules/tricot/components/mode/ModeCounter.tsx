import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_ROW_COUNT } from '../../lib/pattern'

interface Props {
  rowCount: number
  totalRows: number | null
  onCount: (delta: number) => void
}

/** Compteur du mode tricoter, en bas de l'écran sous le pouce : gros +1, petit −1. */
export function ModeCounter({ rowCount, totalRows, onCount }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="icon-lg" aria-label="Retirer un rang" disabled={rowCount === 0} onClick={() => onCount(-1)}>
        <Minus />
      </Button>
      <p className="min-w-0 flex-1 text-center text-sm text-muted-foreground">
        <span className="block text-2xl font-semibold text-foreground tabular-nums">
          {rowCount}
          {totalRows !== null && <span className="text-base font-normal text-muted-foreground"> / {totalRows}</span>}
        </span>
        rangs faits
      </p>
      <Button className="h-14 px-6 text-base" disabled={rowCount >= MAX_ROW_COUNT} onClick={() => onCount(1)}>
        <Plus />
        <span className="sr-only">Ajouter</span> 1 rang
      </Button>
    </div>
  )
}

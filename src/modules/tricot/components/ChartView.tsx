import { Maximize2 } from 'lucide-react'
import { DeleteIcon, EditIcon } from './KnitIcons'
import { useState } from 'react'
import { ItemAction } from './ItemAction'
import { chartPosition, chartStatus, type KnitChart } from '../lib/chart'
import { ChartFullscreen, ChartImage } from './ChartImage'

interface Props {
  chart: KnitChart
  /** Rangs terminés de l'étape (le rang à tricoter est le suivant). */
  rowCount: number
  onEdit: () => void
  onDelete: () => void
}

/** Diagramme d'une étape (préparation) : calage visible sur le rang en cours, réglage, suppression, plein écran. */
export function ChartView({ chart, rowCount, onEdit, onDelete }: Props) {
  const position = chartPosition(chart, rowCount + 1)
  const status = chartStatus(chart, position)
  const name = chart.title || 'Diagramme'
  const [full, setFull] = useState(false)

  return (
    <section aria-label={name} className="space-y-2 rounded-2xl border p-3">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{name}</h3>
          <p role="status" className="text-sm text-muted-foreground">
            {status.main}
            {status.reading && <span className="block">{status.reading}</span>}
          </p>
        </div>
        <ItemAction label={`Plein écran : ${name}`} onClick={() => setFull(true)} disabled={!chart.imageUrl}>
          <Maximize2 />
        </ItemAction>
        <ItemAction label={`Modifier ${name}`} onClick={onEdit}>
          <EditIcon />
        </ItemAction>
        <ItemAction label={`Supprimer ${name}`} onClick={onDelete}>
          <DeleteIcon />
        </ItemAction>
      </div>
      {!full && <ChartImage chart={chart} position={position} zoom={1} className="max-h-[60svh]" />}
      <ChartFullscreen chart={chart} position={position} open={full} onOpenChange={setFull} />
    </section>
  )
}

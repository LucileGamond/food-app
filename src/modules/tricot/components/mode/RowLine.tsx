import { ArrowRight, BellRing, CircleAlert, Flag, Grid3x3 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { describePosition, describeReading } from '../../lib/chart'
import type { Abbreviation } from '../../lib/glossary'
import { describeEvent, type ChartAt, type GuideEvent, type RowGuide } from '../../lib/guide'
import { Glossed } from '../Glossed'
import type { StitchCount } from '../../lib/stitches'
import { ChartStrip } from './ChartStrip'
import { StitchLine } from './StitchLine'

interface Props {
  line: RowGuide
  /** Mailles sur l'aiguille à la fin du rang. */
  stitches: StitchCount
  glossary: Abbreviation[]
  /** Préparation de l'étape, pour régler une section. */
  setupTo: string
  onOpenChart: (chartId: string) => void
}

const ICONS: Record<GuideEvent['kind'], typeof BellRing> = { action: BellRing, section: ArrowRight, 'to-set': CircleAlert, 'step-end': Flag }

/** « Torsade : rang 3 sur 6 · Endroit, de droite à gauche », « Torsade : commence au rang 40 », « Torsade : terminé ». */
function chartLine({ chart, position }: ChartAt): string {
  const name = chart.title || 'Diagramme'
  if (position.kind === 'before') return `${name} : commence au rang ${position.startRow}`
  if (position.kind === 'after') return `${name} : terminé`
  return `${name} : ${describePosition(position, chart).toLowerCase()} · ${describeReading(position, chart.flat)}`
}

function Item({ icon: Icon, strong, children }: { icon: typeof BellRing; strong?: boolean; children: ReactNode }) {
  return (
    <li className={cn('flex items-start gap-2', strong && 'font-medium')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', strong ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/** Le rang à tricoter : tout ce qu'il demande (sections, répétitions, diagrammes), en une ligne. */
export function RowLine({ line, stitches, glossary, setupTo, onOpenChart }: Props) {
  const strips = line.charts.filter((c): c is ChartAt & { position: { kind: 'row' } } => c.position.kind === 'row')
  return (
    // Annoncé au lecteur d'écran à chaque rang compté.
    <section aria-labelledby="row-line" className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
      <div role="status" aria-live="polite" className="space-y-2">
        <h2 id="row-line" className="text-2xl font-semibold tracking-tight tabular-nums">
          Rang {line.row} à tricoter
        </h2>
        {line.unknown ? (
          <p className="flex items-start gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              La suite n’est pas connue : une section est à régler en rangs.{' '}
              <Link to={setupTo} className="font-medium underline underline-offset-4">
                Régler
              </Link>
            </span>
          </p>
        ) : (
          <ul className="space-y-1.5 text-base">
            {line.events.map((event, i) => (
              <Item key={i} icon={ICONS[event.kind]} strong={event.kind === 'action' || event.kind === 'to-set'}>
                <Glossed text={describeEvent(event)} glossary={glossary} />
                {event.kind === 'to-set' && (
                  <>
                    {' '}
                    <Link to={setupTo} className="font-medium underline underline-offset-4">
                      Régler
                    </Link>
                  </>
                )}
              </Item>
            ))}
            {line.events.length === 0 && (
              <li className="text-muted-foreground">
                {line.context ? <Glossed text={line.context} glossary={glossary} /> : 'Rien de particulier sur ce rang.'}
              </li>
            )}
            {line.charts.map((c) => (
              <Item key={c.chart.id} icon={Grid3x3}>
                {chartLine(c)}
              </Item>
            ))}
          </ul>
        )}
      </div>
      {!line.unknown && <StitchLine count={stitches} />}
      {!line.unknown && strips.map((c) => <ChartStrip key={c.chart.id} chart={c.chart} position={c.position} onOpen={() => onOpenChart(c.chart.id)} />)}
    </section>
  )
}

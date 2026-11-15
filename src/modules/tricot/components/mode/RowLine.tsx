import { ArrowRight, BellRing, CircleAlert, Flag, Grid3x3 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { describePosition, describeReading } from '../../lib/chart'
import type { Abbreviation } from '../../lib/glossary'
import { describeEvent, type ChartAt, type GuideEvent, type RowGuide, type Upcoming } from '../../lib/guide'
import { withoutAtPrefix } from '../../lib/pattern'
import type { SubstepCount } from '../../lib/substeps'
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
  /** Sous-étapes où l'on est (plusieurs avec « en même temps ») et leur nombre dans l'étape. */
  substeps?: SubstepCount[]
  sectionCount?: number
  /** Le rang d'après (null : c'était le dernier de l'étape), et la prochaine chose à faire s'il n'a rien de particulier. */
  next?: RowGuide | null
  upcoming?: Upcoming | null
  /** « Une question sur ce rang ? », au niveau du rang. */
  question?: ReactNode
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

/** Ce que demande un rang : ses consignes (ou la sous-étape en cours), puis ses diagrammes. */
function Instructions({ line, glossary, setupTo, quiet }: { line: RowGuide; glossary: Abbreviation[]; setupTo: string; quiet?: ReactNode }) {
  return (
    <ul className="space-y-1.5">
      {line.events.map((event, i) => (
        <Item key={i} icon={ICONS[event.kind]} strong={event.kind === 'action' || event.kind === 'to-set'}>
          <Glossed text={describeEvent(event)} glossary={glossary} />
          {event.kind === 'to-set' && (
            <>
              {' '}
              <Link to={setupTo} className="font-medium underline underline-offset-4">
                Préparer l’étape
              </Link>
            </>
          )}
        </Item>
      ))}
      {line.events.length === 0 && <li className="text-muted-foreground">{quiet ?? (line.context ? <Glossed text={line.context} glossary={glossary} /> : 'Rien de particulier.')}</li>}
      {line.charts.map((c) => (
        <Item key={c.chart.id} icon={Grid3x3}>
          {chartLine(c)}
        </Item>
      ))}
    </ul>
  )
}

/**
 * Le rang à tricoter, d'un coup d'œil : la sous-étape où l'on est, ce rang (consignes, diagramme, mailles en fin de
 * rang), puis le rang suivant. Les nombres de rangs sont au compteur, sous le pouce.
 */
export function RowLine({ line, stitches, glossary, setupTo, onOpenChart, substeps = [], sectionCount = 0, next = null, upcoming = null, question }: Props) {
  const strips = line.charts.filter((c): c is ChartAt & { position: { kind: 'row' } } => c.position.kind === 'row')
  // Rien de particulier au rang suivant : on dit quand arrive la prochaine chose à faire.
  const later = upcoming && next && upcoming.row > next.row ? `Rien de particulier. Ensuite : rang ${upcoming.row}, dans ${upcoming.inRows} — ${upcoming.events.map(describeEvent).join(' · ')}` : null
  return (
    <section aria-labelledby="row-line" className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
      {substeps.length > 0 && (
        <ul aria-label="Sous-étapes en cours" className="space-y-0.5 text-sm">
          {substeps.map((s, i) => (
            // Sur deux lignes au plus : le nom de la sous-étape se lit, au lieu d'être coupé.
            <li key={s.index} className="line-clamp-2">
              <span className="font-medium">
                {i > 0 && 'En même temps · '}Sous-étape {s.index + 1}
                {sectionCount > 0 && ` sur ${sectionCount}`} :
              </span>{' '}
              <span className="text-muted-foreground">{withoutAtPrefix(s.title)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Annoncé au lecteur d'écran à chaque rang compté. */}
      <div role="status" aria-live="polite" className="space-y-2">
        <h2 id="row-line" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Ce rang
        </h2>
        {line.unknown ? (
          <p className="flex items-start gap-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              La suite n’est pas connue : une sous-étape est à régler en rangs.{' '}
              <Link to={setupTo} className="font-medium underline underline-offset-4">
                Préparer l’étape
              </Link>
            </span>
          </p>
        ) : (
          <div className="text-base">
            <Instructions line={line} glossary={glossary} setupTo={setupTo} />
          </div>
        )}
      </div>
      {!line.unknown && <StitchLine count={stitches} />}
      {!line.unknown && strips.map((c) => <ChartStrip key={c.chart.id} chart={c.chart} position={c.position} onOpen={() => onOpenChart(c.chart.id)} />)}
      {!line.unknown && next && !next.unknown && (
        <section aria-labelledby="row-next" className="space-y-1.5 border-t border-brand/20 pt-3 text-sm">
          <h3 id="row-next" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Rang suivant
          </h3>
          <Instructions line={next} glossary={glossary} setupTo={setupTo} quiet={later ?? undefined} />
        </section>
      )}
      {question}
    </section>
  )
}

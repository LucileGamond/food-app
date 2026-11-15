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
import { ItemAction } from '../ItemAction'
import { QuestionIcon } from '../KnitIcons'

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
  /** Le rang d'après (null : c'était le dernier de l'étape), et la prochaine chose à faire, plus loin. */
  next?: RowGuide | null
  upcoming?: Upcoming | null
  /** Le point à tricoter (« jersey », « côtes 1/1 ») sur ce rang et sur le suivant, quand ils n'ont rien de particulier. */
  point?: string | null
  nextPoint?: string | null
  /** Panneau de la question posée (ouvert par le petit bouton d'un titre). */
  question?: ReactNode
  /** Poser une question sur un rang : un petit bouton dans le titre de « Ce rang », « Rang suivant » et « Ensuite ». */
  onAsk?: (row: number) => void
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

/** Ce que demande un rang : ses consignes ou, sans rien de particulier, le point à tricoter ; puis ses diagrammes. */
function Instructions({ line, glossary, setupTo, point }: { line: RowGuide; glossary: Abbreviation[]; setupTo: string; point?: string | null }) {
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
      {line.events.length === 0 && (
        <li className="text-muted-foreground">
          {point ? (
            <>
              Point : <Glossed text={point} glossary={glossary} />
            </>
          ) : line.context ? (
            <Glossed text={line.context} glossary={glossary} />
          ) : (
            'Rien de particulier.'
          )}
        </li>
      )}
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
export function RowLine({ line, stitches, glossary, setupTo, onOpenChart, substeps = [], sectionCount = 0, next = null, upcoming = null, point = null, nextPoint = null, question, onAsk }: Props) {
  const ask = (row: number, label: string) =>
    onAsk && (
      <ItemAction label={label} className="-my-1.5 ml-auto" onClick={() => onAsk(row)}>
        <QuestionIcon />
      </ItemAction>
    )
  const strips = line.charts.filter((c): c is ChartAt & { position: { kind: 'row' } } => c.position.kind === 'row')
  // La prochaine chose à faire, quand elle tombe plus loin que le rang suivant.
  const later = upcoming && (!next || upcoming.row > next.row) ? upcoming : null
  return (
    <section aria-labelledby="row-line" data-row={line.row} className="space-y-3 rounded-2xl border border-brand/40 bg-brand/5 p-4">
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
        {/* Le numéro du rang de l'étape à tricoter maintenant : rien tricoté, c'est le rang 1. */}
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <span id="row-line">Ce rang</span> <span className="knit-name text-sm text-foreground normal-case tabular-nums">· rang {line.row}</span>
          </h2>
          {ask(line.row, 'Une question sur ce rang ?')}
        </div>
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
            <Instructions line={line} glossary={glossary} setupTo={setupTo} point={point} />
          </div>
        )}
      </div>
      {!line.unknown && <StitchLine count={stitches} setupTo={setupTo} />}
      {!line.unknown && strips.map((c) => <ChartStrip key={c.chart.id} chart={c.chart} position={c.position} onOpen={() => onOpenChart(c.chart.id)} />)}
      {!line.unknown && next && !next.unknown && (
        <section aria-labelledby="row-next" className="space-y-1.5 border-t border-brand/20 pt-3 text-sm">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span id="row-next">Rang suivant</span> <span className="knit-name text-sm text-foreground normal-case tabular-nums">· rang {next.row}</span>
            </h3>
            {ask(next.row, 'Une question sur le rang suivant ?')}
          </div>
          <Instructions line={next} glossary={glossary} setupTo={setupTo} point={nextPoint} />
        </section>
      )}
      {!line.unknown && later && (
        <section aria-labelledby="row-later" className="space-y-1.5 border-t border-brand/20 pt-3 text-sm">
          <div className="flex items-center gap-2">
            <h3 id="row-later" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Ensuite
            </h3>
            {ask(later.row, `Une question sur le rang ${later.row} ?`)}
          </div>
          <p className="flex items-start gap-2">
            <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Rang {later.row}, dans {later.inRows} — <Glossed text={later.events.map(describeEvent).join(' · ')} glossary={glossary} />
            </span>
          </p>
        </section>
      )}
      {question}
    </section>
  )
}

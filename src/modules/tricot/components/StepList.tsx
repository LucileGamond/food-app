// Liste des étapes à préparer (onglet « Préparer ») : chacune ouvre sa préparation.

import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DoneIcon, OpenIcon } from './KnitIcons'
import type { ShownStep } from '../lib/adapt'
import type { ProjectGauge } from '../lib/gauges'
import { isReady } from '../lib/ready'
import { describePass } from '../lib/passes'

interface Props {
  steps: ShownStep[]
  current: ShownStep | undefined
  needles: number[]
  gauges: ProjectGauge[]
}

export function StepList({ steps, current, needles, gauges }: Props) {
  return (
    <nav aria-label="Étapes">
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune étape : la lecture du patron n’en a trouvé aucune.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const isCurrent = s.id === current?.id && !s.done
            const toPrepare = !s.done && !isReady(s, needles, gauges)
            const pass = describePass(s)
            return (
              <li key={s.id}>
                <Link
                  to={`?etape=${encodeURIComponent(s.id)}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    isCurrent ? 'border-brand bg-brand/5' : 'bg-background hover:bg-muted/50',
                  )}
                >
                  {/* Le numéro reste lisible même terminée : la numérotation ne saute pas. */}
                  <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs', s.done ? 'bg-brand/15 font-medium text-brand' : 'bg-muted')} aria-hidden>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {s.done && <DoneIcon className="size-4 shrink-0" aria-hidden />}
                      <span className="truncate knit-name">{s.title}</span>
                    </span>
                    {(s.rowCount > 0 || s.totalRows !== null || s.times > 1) && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {s.rowCount}
                        {s.totalRows !== null && ` / ${s.totalRows}`} rangs
                        {pass && ` · ${pass}`}
                      </span>
                    )}
                    {/* Les pastilles sous le titre : elles ne le rognent pas. */}
                    {(isCurrent || toPrepare) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium">
                            <span className="yarn-dot size-2.5" aria-hidden />
                            En cours
                          </span>
                        )}
                        {toPrepare && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium">À préparer</span>}
                      </span>
                    )}
                  </span>
                  {s.done && <span className="sr-only">(terminée)</span>}
                  <OpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </nav>
  )
}

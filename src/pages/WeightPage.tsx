import { BellRing, Plus, RefreshCw, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToday } from '@/hooks/useToday'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { WeighInDialog } from '@/components/weights/WeighInDialog'
import { WeightChart } from '@/components/weights/WeightChart'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useWeights } from '@/hooks/useWeights'
import type { ChartSeries } from '@/lib/chart'
import { formatFullDate, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  PERIODS,
  entriesOf,
  filterFrom,
  formatDeltaKg,
  formatKg,
  groupByDate,
  periodStart,
  staleLabel,
  staleProfiles,
  summarize,
  type PersonSummary,
  type WeighInRow,
  type WeightPeriod,
} from '@/lib/weights'

const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']

type DialogState = { kind: 'none' } | { kind: 'form'; row: WeighInRow | null } | { kind: 'delete'; row: WeighInRow }

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  return (
    <span className="text-xs text-muted-foreground">
      <span className="font-medium whitespace-nowrap text-foreground tabular-nums">{formatDeltaKg(value)}</span> {label}
    </span>
  )
}

function SummaryCard({ summary, color, periodLabel }: { summary: PersonSummary; color: string; periodLabel: string }) {
  const { latest } = summary
  return (
    <article aria-label={summary.profile.display_name} className="rounded-2xl border bg-background p-3 shadow-xs sm:p-4">
      <header className="flex items-center gap-2 text-sm font-medium">
        <span className="h-0.5 w-4 rounded-full" style={{ background: color }} aria-hidden />
        {summary.profile.display_name}
      </header>
      {latest ? (
        <>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{formatKg(latest.weight_kg)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatFullDate(latest.measured_on)}
            {summary.daysSinceLatest !== null && summary.daysSinceLatest > 0 && ` · il y a ${summary.daysSinceLatest} j`}
          </p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
            <Delta value={summary.deltaPrevious} label="vs pesée précédente" />
            <Delta value={summary.deltaPeriod} label={`sur ${periodLabel}`} />
          </div>
          {summary.min !== null && summary.max !== null && summary.min !== summary.max && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">Min {formatKg(summary.min)}</span> · <span className="whitespace-nowrap">Max {formatKg(summary.max)}</span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Aucune pesée</p>
      )}
    </article>
  )
}

export function WeightPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useToday(fixedToday)
  const api = useApi()
  const { profiles } = useAuth()
  const weights = useWeights(api)
  const [period, setPeriod] = useState<WeightPeriod>('1y')
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })

  const from = periodStart(period, today)
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase()
  const visible = useMemo(() => filterFrom(weights.entries, from), [weights.entries, from])
  const summaries = useMemo(() => profiles.map((p) => summarize(weights.entries, p, from, today)), [profiles, weights.entries, from, today])
  const stale = staleProfiles(summaries)
  const rows = useMemo(() => groupByDate(weights.entries), [weights.entries])
  const colorOf = (id: string) => SERIES_COLORS[Math.max(0, profiles.findIndex((p) => p.id === id)) % SERIES_COLORS.length]!

  const series: ChartSeries[] = profiles
    .map((p) => ({ id: p.id, label: p.display_name, color: colorOf(p.id), entries: entriesOf(visible, p.id) }))
    .filter((s) => s.entries.length > 0)
  const chartFrom = from ?? weights.entries[0]?.measured_on ?? today

  const close = () => setDialog({ kind: 'none' })
  const deleting = dialog.kind === 'delete' ? dialog.row : null

  /** Clic sur un point du graphique : ouvre la pesée de cette date. */
  function openDate(date: IsoDate) {
    const row = rows.find((r) => r.date === date)
    if (row) setDialog({ kind: 'form', row })
  }

  const addButton = (
    <Button className="h-10 px-4" onClick={() => setDialog({ kind: 'form', row: null })}>
      <Plus /> Nouvelle pesée
    </Button>
  )

  return (
    <>
      <PageHeader title="Poids" description="Suivi des pesées du foyer" actions={addButton} />

      {weights.loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{weights.loadError}</p>
          <Button variant="outline" onClick={() => void weights.reload()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : weights.loading || profiles.length === 0 ? (
        <div className="space-y-4" aria-busy="true" aria-label="Chargement des pesées">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : weights.entries.length === 0 ? (
        <EmptyState icon={Scale} title="Aucune pesée" description="Ajoute une première pesée pour commencer le suivi." action={addButton} />
      ) : (
        <div className="space-y-6">
          {stale.length > 0 && (
            <div role="status" className="flex items-start gap-3 rounded-xl border bg-background p-4 text-sm shadow-xs">
              <BellRing className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="font-medium">C'est l'heure de se peser</p>
                <ul className="mt-0.5 text-muted-foreground">
                  {stale.map((s) => (
                    <li key={s.profile.id}>{staleLabel(s)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {summaries.map((s) => (
              <SummaryCard key={s.profile.id} summary={s} color={colorOf(s.profile.id)} periodLabel={periodLabel} />
            ))}
          </div>

          <section aria-labelledby="chart-title" className="rounded-2xl border bg-background p-4 shadow-xs">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="chart-title" className="font-semibold tracking-tight">
                  Évolution
                </h2>
                <p className="text-xs text-muted-foreground">Clique sur un point pour modifier ou supprimer la pesée.</p>
              </div>
              <div role="radiogroup" aria-label="Période" className="inline-flex rounded-lg bg-muted p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={period === p.value}
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      'h-8 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      period === p.value && 'bg-background text-foreground shadow-sm',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {series.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Légende">
                {series.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            {series.length > 0 ? (
              <WeightChart series={series} from={chartFrom} to={today} onSelect={openDate} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Aucune pesée sur cette période.</p>
            )}
          </section>
        </div>
      )}

      <WeighInDialog
        open={dialog.kind === 'form'}
        onOpenChange={(open) => !open && close()}
        editing={dialog.kind === 'form' ? dialog.row : null}
        rows={rows}
        profiles={profiles}
        today={today}
        onSubmit={weights.saveWeighIn}
        onDelete={(row) => setDialog({ kind: 'delete', row })}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && close()}
        title="Supprimer cette pesée ?"
        description={
          deleting && (
            <>
              <span className="block font-medium text-foreground">{formatFullDate(deleting.date)}</span>
              {profiles
                .filter((p) => deleting.weights[p.id] !== undefined)
                .map((p) => `${p.display_name} : ${formatKg(deleting.weights[p.id]!)}`)
                .join(' · ')}
            </>
          )
        }
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleting) await weights.deleteWeighIn(deleting.date)
        }}
      />
    </>
  )
}

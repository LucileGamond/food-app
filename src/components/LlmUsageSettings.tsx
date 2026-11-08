// Réglages : consommation du modèle (Claude) par le foyer, par fonctionnalité et par personne, avec un coût estimé.

import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEur, formatTokens, periodRange, summarizeUsage, USAGE_PERIODS, type UsagePeriod, type UsageRow, type UsageTotals } from '@/lib/llmUsage'

const plural = (n: number, word: string) => `${n.toLocaleString('fr-FR')} ${word}${n > 1 ? 's' : ''}`

function Figures({ totals }: { totals: UsageTotals }) {
  return (
    <span className="text-sm text-muted-foreground">
      {plural(totals.calls, 'appel')}
      {totals.failures > 0 && ` (${plural(totals.failures, 'échec')})`} · {formatTokens(totals.inputTokens)} en entrée · {formatTokens(totals.outputTokens)} en sortie
      {totals.webSearches > 0 && ` · ${plural(totals.webSearches, 'recherche')} web`}
    </span>
  )
}

const Cost = ({ totals }: { totals: UsageTotals }) => <span className="shrink-0 font-medium tabular-nums">{formatEur(totals.costEur)}</span>

export function LlmUsageSettings() {
  const api = useApi()
  const { profiles } = useAuth()
  const [period, setPeriod] = useState<UsagePeriod>('month')
  // Résultat de la dernière période chargée : tant qu'il ne correspond pas à la période choisie, on attend.
  const [loaded, setLoaded] = useState<{ period: UsagePeriod; rows: UsageRow[] | null; error: string | null } | null>(null)

  useEffect(() => {
    let current = true
    const { since, until } = periodRange(period)
    api.llmUsage.summary(since, until).then(
      (data) => current && setLoaded({ period, rows: data, error: null }),
      (e: unknown) => current && setLoaded({ period, rows: null, error: errorMessage(e) }),
    )
    return () => {
      current = false
    }
  }, [api, period])

  const ready = loaded?.period === period ? loaded : null
  const rows = ready?.rows ?? null
  const error = ready?.error ?? null
  const summary = useMemo(() => (rows ? summarizeUsage(rows, profiles) : null), [rows, profiles])

  return (
    <section aria-labelledby="section-conso-ia" className="rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
      <h2 id="section-conso-ia" className="font-medium">
        Consommation IA
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Tokens utilisés par les imports, le tricot, les idées de repas… et coût estimé (tarif Anthropic, en euros).</p>

      <div className="mt-3 flex items-center gap-2">
        <Label htmlFor="conso-ia-periode">Période</Label>
        <NativeSelect id="conso-ia-periode" value={period} onChange={(e) => setPeriod(e.target.value as UsagePeriod)}>
          {USAGE_PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : !summary ? (
        <Skeleton className="mt-3 h-24 rounded-xl" aria-label="Chargement de la consommation" />
      ) : summary.total.calls === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucun appel sur cette période.</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div role="group" aria-label="Foyer" className="flex items-start justify-between gap-3 rounded-xl bg-muted/50 p-3">
            <div className="min-w-0">
              <p className="font-medium">Foyer</p>
              <Figures totals={summary.total} />
            </div>
            <Cost totals={summary.total} />
          </div>
          {summary.total.partialCost && <p className="text-sm text-muted-foreground">Coût partiel : certains appels utilisent un modèle sans tarif connu.</p>}

          <div>
            <h3 id="conso-ia-fonctions" className="text-sm font-medium">
              Par fonctionnalité
            </h3>
            <ul aria-labelledby="conso-ia-fonctions" className="mt-1 divide-y">
              {summary.byFeature.map((feature) => (
                <li key={feature.function} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p>{feature.label}</p>
                      <Figures totals={feature} />
                    </div>
                    <Cost totals={feature} />
                  </div>
                  {(feature.modes.length > 1 || feature.modes[0]?.mode) && (
                    <ul className="mt-1 space-y-1 border-l pl-3">
                      {feature.modes.map((mode) => (
                        <li key={mode.mode ?? ''} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm">{mode.label}</p>
                            <Figures totals={mode} />
                          </div>
                          <Cost totals={mode} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 id="conso-ia-personnes" className="text-sm font-medium">
              Par personne
            </h3>
            <ul aria-labelledby="conso-ia-personnes" className="mt-1 divide-y">
              {summary.byPerson.map((person) => (
                <li key={person.userId ?? ''} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p>{person.name}</p>
                    <Figures totals={person} />
                  </div>
                  <Cost totals={person} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

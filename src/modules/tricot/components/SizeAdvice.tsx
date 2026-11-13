// « Quelle taille pour qui ? » (après la lecture d'un patron) : tableau des mesures du patron, fiche de mesures choisie
// et aisance voulue → taille conseillée ; si ce n'est pas la taille lue, on relit le patron pour elle.

import { Loader2, RefreshCw, Ruler } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { LoadError } from '@/components/LoadError'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { adviseSize, defaultEase, describeAdvice, EASE_STYLES, MEASURE_LABELS, styleOf, type SizeChart } from '../lib/sizing'

interface Props {
  chart: SizeChart
  sizes: string[]
  /** Taille pour laquelle rangs et mailles ont été comptés à la lecture. */
  readIndex: number | null
  /** Relit le patron pour une autre taille. */
  onReread: (size: string) => void
  rereading: boolean
}

const cm = (n: number | null) => (n === null ? '–' : String(n).replace('.', ','))

export function SizeAdvice({ chart, sizes, readIndex, onReread, rereading }: Props) {
  const id = useId()
  const api = useApi()
  const profiles = useAsync(() => api.knitting.listMeasures(), [api])
  const [chosen, setChosen] = useState<string | null>(null)
  const [ease, setEase] = useState(() => defaultEase(chart))
  const [easeText, setEaseText] = useState(() => cm(defaultEase(chart)))
  const list = profiles.data ?? []
  const profile = list.find((p) => p.id === chosen) ?? list[0] ?? null
  const advice = profile ? adviseSize(chart, profile, ease) : null
  const advised = advice?.kind === 'size' ? advice.index : null
  const style = styleOf(ease)

  function pickEase(value: number) {
    setEase(value)
    setEaseText(cm(value))
  }

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border bg-background p-4 shadow-xs">
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold">
        <Ruler className="size-4 text-muted-foreground" aria-hidden /> Quelle taille pour qui ?
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Tableau des mesures du patron ({chart.kind === 'finished' ? 'vêtement fini' : 'mesures du corps'})</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-3 text-left font-normal text-muted-foreground">
                {chart.kind === 'finished' ? 'Vêtement fini (cm)' : 'Mesures du corps (cm)'}
              </th>
              {sizes.map((size, i) => (
                <th key={i} scope="col" className={cn('px-2 py-1 text-right', i === advised && 'rounded-t-lg bg-brand/15')}>
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="py-1 pr-3 text-left font-normal">
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td key={i} className={cn('px-2 py-1 text-right', i === advised && 'bg-brand/15 font-semibold')}>
                    {cm(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profiles.error ? (
        <LoadError message={profiles.error} onRetry={profiles.reload} />
      ) : profiles.data && list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune fiche de mesures : ajoute-la dans{' '}
          <Link to="/tricot" className="font-medium text-foreground underline underline-offset-4">
            Tricot › Fiches de mesures
          </Link>{' '}
          pour qu’on te conseille une taille.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-who`}>Pour qui</Label>
            <NativeSelect id={`${id}-who`} className="h-10 min-w-36" value={profile?.id ?? ''} disabled={!profiles.data} onChange={(e) => setChosen(e.target.value)}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {chart.kind === 'finished' && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Aisance{chart.easeCm !== null && ` (patron : ${cm(chart.easeCm)} cm)`}</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {EASE_STYLES.map((s) => (
                  // La plage est écrite sous le nom : une infobulle de survol n'existe pas au doigt.
                  <Button
                    key={s.key}
                    type="button"
                    className="h-auto min-h-11 flex-col gap-0 px-3 py-1.5"
                    variant={style === s.key ? 'default' : 'outline'}
                    aria-pressed={style === s.key}
                    onClick={() => pickEase(s.cm)}
                  >
                    {/* L'espace garde le nom lu (« Classique 5 à 10 cm ») identique au texte vu. */}
                    <span>{s.label}</span>{' '}
                    <span className="text-xs font-normal opacity-75">{s.range}</span>
                  </Button>
                ))}
                <Label htmlFor={`${id}-ease`} className="sr-only">
                  Aisance en cm
                </Label>
                <Input
                  id={`${id}-ease`}
                  className="h-8 w-16"
                  inputMode="decimal"
                  value={easeText}
                  onChange={(e) => {
                    setEaseText(e.target.value)
                    const n = Number(e.target.value.trim().replace(',', '.'))
                    if (e.target.value.trim() && Number.isFinite(n) && n >= -20 && n <= 60) setEase(n)
                  }}
                />
                <span className="text-sm text-muted-foreground">cm</span>
              </div>
            </fieldset>
          )}
        </div>
      )}

      {advice && (
        <div role="status" className="rounded-xl bg-muted/50 p-3 text-sm">
          {advice.kind === 'size' ? (
            <>
              <p className="font-medium">Taille conseillée : {sizes[advice.index]}</p>
              <p className="text-muted-foreground">{describeAdvice(advice, sizes, chart)}</p>
            </>
          ) : advice.kind === 'no-match' ? (
            <p>
              Aucune mesure de la fiche ne correspond au tableau du patron ({chart.rows.map((r) => r.label).join(', ')}) : complète la fiche (
              {Object.values(MEASURE_LABELS).join(', ').toLowerCase()}).
            </p>
          ) : null}
        </div>
      )}

      {advised !== null && advised !== readIndex && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Les rangs et mailles ont été comptés pour la taille {readIndex !== null ? sizes[readIndex] : 'lue'}.</p>
          <Button type="button" className="h-10" disabled={rereading} onClick={() => onReread(sizes[advised]!)}>
            {rereading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw />}
            {rereading ? 'Lecture…' : `Relire pour la taille ${sizes[advised]}`}
          </Button>
        </div>
      )}
    </section>
  )
}

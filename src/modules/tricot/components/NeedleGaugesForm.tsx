import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNeedle } from '../lib/needles'
import { HelpTip } from './HelpTip'
import { gaugeOf, type NeedleGauge } from '../lib/needleGauges'
import { parseGauge } from '../lib/yarn'

interface Props {
  needles: number[]
  gauges: NeedleGauge[]
  /** Échantillons par aiguille saisis (les vérifications sont recalculées par l'appelant). */
  onSave: (gauges: NeedleGauge[]) => Promise<boolean>
}

const text = (value: number | null | undefined) => (value == null ? '' : String(value).replace('.', ','))

/**
 * Ton échantillon avec chaque aiguille du patron (facultatif) : les sous-étapes de cette aiguille sont converties avec
 * lui, sinon avec ton échantillon général.
 */
export function NeedleGaugesForm({ needles, gauges, onSave }: Props) {
  const [values, setValues] = useState(() => Object.fromEntries(needles.map((n) => [n, { stitches: text(gaugeOf(gauges, n)?.stitches), rows: text(gaugeOf(gauges, n)?.rows) }])))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (needles.length < 2) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = needles.map((n) => ({ needle: n, stitches: parseGauge(values[n]!.stitches), rows: parseGauge(values[n]!.rows) }))
    if (parsed.some((p) => p.stitches === undefined || p.rows === undefined)) return setError('Échantillon : un nombre entre 1 et 100 pour 10 cm.')
    setError(null)
    setSaving(true)
    // Les vérifications des autres aiguilles (et des projets sans aiguille) sont gardées
    const others = gauges.filter((g) => g.needle === null || !needles.includes(g.needle))
    await onSave([...others, ...parsed.map((p) => ({ needle: p.needle, stitches: p.stitches!, rows: p.rows!, checked: gaugeOf(gauges, p.needle)?.checked ?? false }))])
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label="Échantillon par aiguille" className="space-y-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ton échantillon par aiguille (facultatif, pour 10 cm)</legend>
        {needles.map((n) => (
          <div key={n} className="grid grid-cols-[5rem_1fr_1fr] items-end gap-2">
            <span className="pb-2.5 text-sm">{formatNeedle(n)}</span>
            {(['stitches', 'rows'] as const).map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`needle-gauge-${n}-${key}`} className="text-xs text-muted-foreground">
                  {key === 'stitches' ? 'Mailles' : 'Rangs'} ({formatNeedle(n)})
                </Label>
                <Input
                  id={`needle-gauge-${n}-${key}`}
                  inputMode="decimal"
                  className="h-10"
                  value={values[n]![key]}
                  onChange={(e) => setValues((v) => ({ ...v, [n]: { ...v[n]!, [key]: e.target.value } }))}
                />
              </div>
            ))}
          </div>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button type="submit" variant="outline" className="h-10" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer les échantillons par aiguille
        </Button>
        <HelpTip label="échantillon par aiguille">Sans échantillon pour une aiguille, ses sous-étapes utilisent ton échantillon général (sinon celui du patron).</HelpTip>
      </div>
    </form>
  )
}

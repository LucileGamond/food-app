import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNeedle } from '../lib/needles'
import { gaugeOf, type NeedleGauge } from '../lib/needleGauges'
import { parseGauge } from '../lib/yarn'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aiguille dont on note l'échantillon (null : l'échantillon du projet). */
  needle: number | null
  gauges: NeedleGauge[]
  onSave: (gauges: NeedleGauge[]) => Promise<boolean>
}

const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','))

/**
 * Échantillon noté sans quitter l'étape : celui de l'aiguille de la sous-étape (ou du projet quand il n'y en a pas),
 * pour que les hauteurs en cm du patron se convertissent en rangs.
 */
export function GaugeDialog({ open, onOpenChange, needle, gauges, onSave }: Props) {
  const current = gaugeOf(gauges, needle)
  const [values, setValues] = useState({ stitches: text(current?.stitches), rows: text(current?.rows) })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const stitches = parseGauge(values.stitches)
    const rows = parseGauge(values.rows)
    if (stitches === undefined || rows === undefined) return setError('Échantillon : un nombre entre 1 et 100 pour 10 cm.')
    if (rows === null) return setError('Indique les rangs : ce sont eux qui convertissent les centimètres.')
    setError(null)
    setSaving(true)
    // L'échantillon change : les conversions de cette aiguille sont à revérifier.
    const ok = await onSave([...gauges.filter((g) => g.needle !== needle), { needle, stitches, rows, checked: false }])
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  const label = needle === null ? 'de ce projet' : `de l’aiguille ${formatNeedle(needle)}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} noValidate aria-label="Ton échantillon">
          <DialogHeader>
            <DialogTitle>Ton échantillon {label}</DialogTitle>
            <DialogDescription>Pour 10 cm, sur ton essai. Les hauteurs en centimètres du patron se convertissent avec les rangs.</DialogDescription>
          </DialogHeader>
          <div className="my-4 grid grid-cols-2 gap-3">
            {(['stitches', 'rows'] as const).map((key) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`gauge-dialog-${key}`}>{key === 'stitches' ? 'Tes mailles' : 'Tes rangs'}</Label>
                <Input
                  id={`gauge-dialog-${key}`}
                  className="h-10"
                  inputMode="decimal"
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  aria-invalid={!!error}
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

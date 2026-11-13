import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { formatGaugeCounts, gaugeOf, withGauge, withoutGauge, MAX_GAUGES, type ProjectGauge } from '../lib/gauges'
import { formatNeedle } from '../lib/needles'
import { parseGauge } from '../lib/yarn'
import { HelpTip } from './HelpTip'
import { Note } from './Note'

interface Props {
  /** Les échantillons du projet : la seule source pour tous les calculs. */
  gauges: ProjectGauge[]
  /** Aiguilles du patron, proposées dans le choix. */
  needles: number[]
  onSave: (gauges: ProjectGauge[]) => Promise<boolean>
  /** Aiguille dont on veut noter l'échantillon tout de suite (venue d'une sous-étape à convertir). */
  openFor?: number | null
  onOpened?: () => void
}

const text = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

/** « Aiguille 3,5 mm », « Toutes aiguilles » pour celui qui vaut par défaut. */
export const gaugeName = (needle: number | null): string => (needle === null ? 'Toutes aiguilles' : `Aiguille ${formatNeedle(needle)}`)

/** Saisie d'un échantillon : son aiguille (ou aucune), ses mailles et ses rangs pour 10 cm. */
function GaugeForm({ gauge, taken, needles, onSave, onCancel }: { gauge: ProjectGauge | null; taken: (number | null)[]; needles: number[]; onSave: (g: ProjectGauge) => Promise<boolean>; onCancel: () => void }) {
  const [needle, setNeedle] = useState(gauge ? (gauge.needle === null ? '' : String(gauge.needle)) : '')
  const [values, setValues] = useState({ stitches: text(gauge?.stitches ?? null), rows: text(gauge?.rows ?? null) })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Les aiguilles déjà notées ne sont plus proposées (une seule ligne par aiguille).
  const free = needles.filter((n) => n === gauge?.needle || !taken.includes(n))
  const freeDefault = gauge?.needle === null || !taken.includes(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const stitches = parseGauge(values.stitches)
    const rows = parseGauge(values.rows)
    if (stitches === undefined || rows === undefined) return setError('Mailles et rangs : un nombre entre 1 et 100 pour 10 cm.')
    if (stitches === null && rows === null) return setError('Note au moins les mailles ou les rangs.')
    setError(null)
    setSaving(true)
    const ok = await onSave({ needle: needle === '' ? null : Number(needle), stitches, rows, checked: gauge?.checked ?? false })
    setSaving(false)
    if (!ok) setError('L’échantillon n’a pas pu être enregistré. Réessaie.')
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label="Échantillon" className="space-y-3 rounded-xl border bg-background p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="gauge-needle">Aiguille</Label>
        <NativeSelect id="gauge-needle" className="h-10" value={needle} onChange={(e) => setNeedle(e.target.value)}>
          {freeDefault && <option value="">Toutes aiguilles</option>}
          {free.map((n) => (
            <option key={n} value={String(n)}>
              {formatNeedle(n)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['stitches', 'rows'] as const).map((key) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`gauge-${key}`}>{key === 'stitches' ? 'Mailles' : 'Rangs'}</Label>
            <Input
              id={`gauge-${key}`}
              className="h-10"
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              aria-invalid={!!error}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Compte tes mailles et tes rangs sur 10 cm, dans l’échantillon que tu as tricoté avec cette aiguille.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-10" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="submit" className="h-10" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/**
 * Les échantillons du projet, en une seule liste : autant qu'on veut, un par aiguille, plus celui qui vaut pour toutes.
 * C'est lui qui sert aux calculs de l'étape et de ses sous-étapes, d'après l'aiguille qu'elles utilisent.
 */
export function GaugesList({ gauges, needles, onSave, openFor, onOpened }: Props) {
  // null : rien d'ouvert ; 'new' : un nouvel échantillon ; un nombre ou null dans l'objet : celui qu'on modifie.
  const [editing, setEditing] = useState<{ gauge: ProjectGauge | null } | null>(null)
  const [removing, setRemoving] = useState<ProjectGauge | null>(null)
  const taken = gauges.map((g) => g.needle)

  useEffect(() => {
    if (openFor === undefined) return
    setEditing({ gauge: gaugeOf(gauges, openFor) ?? { needle: openFor, stitches: null, rows: null, checked: false } })
    onOpened?.()
    // Une seule ouverture, à l'arrivée depuis une sous-étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFor])

  async function save(gauge: ProjectGauge): Promise<boolean> {
    const ok = await onSave(withGauge(gauges, gauge))
    if (ok) setEditing(null)
    return ok
  }

  return (
    <section aria-labelledby="knit-gauges" className="space-y-2">
      <div className="flex items-center gap-1">
        <h3 id="knit-gauges" className="text-sm font-medium">
          Mes échantillons
        </h3>
        <HelpTip label="mes échantillons">
          Un échantillon par aiguille : c’est celui de l’aiguille d’une sous-étape qui sert à convertir ses centimètres en rangs et à estimer ses mailles. « Toutes aiguilles » sert quand une aiguille n’a pas le sien.
        </HelpTip>
      </div>
      {gauges.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun échantillon : note-le pour que les centimètres du patron deviennent des rangs.</p>
      ) : (
        <ul className="divide-y">
          {gauges.map((gauge) => (
            <li key={String(gauge.needle)} className="flex items-center gap-2 py-1 first:pt-0 last:pb-0">
              <p className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{gaugeName(gauge.needle)}</span>
                <span className="text-muted-foreground">{formatGaugeCounts(gauge) ?? 'rien de noté'}</span>
              </p>
              <Button variant="ghost" size="icon-touch" aria-label={`Modifier l’échantillon : ${gaugeName(gauge.needle)}`} onClick={() => setEditing({ gauge })}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-touch" aria-label={`Supprimer l’échantillon : ${gaugeName(gauge.needle)}`} onClick={() => setRemoving(gauge)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <GaugeForm gauge={editing.gauge} taken={taken} needles={needles} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        gauges.length < MAX_GAUGES &&
        (needles.some((n) => !taken.includes(n)) || !taken.includes(null) ? (
          <Button variant="outline" className="h-10" onClick={() => setEditing({ gauge: null })}>
            <Plus /> Ajouter un échantillon
          </Button>
        ) : (
          <Note>Chaque aiguille du patron a son échantillon.</Note>
        ))
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cet échantillon ?"
        description={removing ? `« ${gaugeName(removing.needle)} » ne servira plus aux calculs des étapes.` : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (removing) await onSave(withoutGauge(gauges, removing.needle))
        }}
      />
    </section>
  )
}

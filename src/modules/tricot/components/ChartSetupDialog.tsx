import { Crop, Loader2 } from 'lucide-react'
import { useId, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { formToSetup, MAX_CHART_TITLE, moveNearestLine, rowBand, type ChartForm, type ChartSetup } from '../lib/chart'
import type { KnitStep } from '../lib/pattern'

interface Props {
  open: boolean
  /** Image à caler (adresse locale ou temporaire). */
  imageUrl: string | null
  /** Calage de départ : celui du diagramme modifié, ou l'image entière. */
  initial: ChartForm
  steps: Pick<KnitStep, 'id' | 'title'>[]
  /** Nouveau diagramme : l'image peut encore être recadrée. */
  onCrop?: () => void
  onCancel: () => void
  /** Renvoie false si l'enregistrement a échoué (la fenêtre reste ouverte). */
  onSave: (setup: ChartSetup) => Promise<boolean>
}

const PER_MILLE = 1000

/**
 * Calage d'un diagramme : deux traits glissés du doigt (haut du dernier rang, bas du rang 1) et le nombre de rangs ;
 * les rangs sont dessinés par-dessus pour vérifier qu'ils tombent sur la grille.
 */
export function ChartSetupDialog({ open, imageUrl, initial, steps, onCrop, onCancel, onSave }: Props) {
  const [form, setForm] = useState<ChartForm>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const id = useId()

  const update = (patch: Partial<ChartForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }

  function moveTo(event: PointerEvent) {
    const box = frame.current!.getBoundingClientRect()
    if (box.height === 0) return
    update(moveNearestLine(form, (event.clientY - box.top) / box.height))
  }

  async function save() {
    const setup = formToSetup(form)
    if (typeof setup === 'string') {
      setError(setup)
      return
    }
    setSaving(true)
    try {
      await onSave(setup)
    } finally {
      setSaving(false)
    }
  }

  const rows = Number(form.rows)
  const showRows = Number.isInteger(rows) && rows >= 1 && rows <= 500
  const firstRow = showRows ? rowBand({ ...form, rows }, 1) : null
  const pct = (n: number) => `${n * 100}%`

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onCancel()}>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Caler le diagramme</DialogTitle>
          <DialogDescription>Glisse les deux traits sur le haut de la dernière ligne et le bas de la ligne 1, puis indique le nombre de lignes.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-40 items-center justify-center rounded-lg bg-muted">
          {imageUrl ? (
            <div
              ref={frame}
              className="relative touch-none select-none"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId)
                dragging.current = true
                moveTo(e)
              }}
              onPointerMove={(e) => dragging.current && moveTo(e)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
              data-testid="chart-setup-area"
            >
              <img src={imageUrl} alt="Diagramme à caler" className="block max-h-[50svh] max-w-full" draggable={false} />
              {showRows && (
                <div
                  className="pointer-events-none absolute inset-x-0"
                  style={{
                    top: pct(form.gridTop),
                    height: pct(form.gridBottom - form.gridTop),
                    // Un trait fin en bas de chaque rang.
                    backgroundImage: 'linear-gradient(to top, color-mix(in oklab, var(--brand) 55%, transparent) 1px, transparent 1px)',
                    backgroundSize: `100% ${100 / rows}%`,
                    backgroundPosition: 'bottom',
                  }}
                  aria-hidden
                />
              )}
              {firstRow && <div className="pointer-events-none absolute inset-x-0 bg-brand/25" style={{ top: pct(firstRow.top), height: pct(firstRow.bottom - firstRow.top) }} aria-hidden />}
              <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-brand" style={{ top: pct(form.gridTop) }} aria-hidden />
              <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-brand" style={{ top: pct(form.gridBottom) }} aria-hidden />
            </div>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Chargement de l’image" />
          )}
        </div>
        {onCrop && (
          <Button type="button" variant="outline" className="h-10 justify-self-start" onClick={onCrop} disabled={saving}>
            <Crop /> Recadrer l’image
          </Button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-top`}>Haut de la dernière ligne</Label>
            <input
              id={`${id}-top`}
              type="range"
              min={0}
              max={PER_MILLE}
              value={Math.round(form.gridTop * PER_MILLE)}
              onChange={(e) => update({ gridTop: Math.min(Number(e.target.value) / PER_MILLE, form.gridBottom - 0.02) })}
              className="accent-brand"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-bottom`}>Bas de la ligne 1</Label>
            <input
              id={`${id}-bottom`}
              type="range"
              min={0}
              max={PER_MILLE}
              value={Math.round(form.gridBottom * PER_MILLE)}
              onChange={(e) => update({ gridBottom: Math.max(Number(e.target.value) / PER_MILLE, form.gridTop + 0.02) })}
              className="accent-brand"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-rows`}>Lignes de la grille</Label>
            <Input id={`${id}-rows`} className="h-10" inputMode="numeric" maxLength={3} value={form.rows} onChange={(e) => update({ rows: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-title`}>Nom (facultatif)</Label>
            <Input id={`${id}-title`} className="h-10" maxLength={MAX_CHART_TITLE} placeholder="Torsade, jacquard…" value={form.title} onChange={(e) => update({ title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-step`}>Étape</Label>
            <NativeSelect id={`${id}-step`} value={form.stepId} onChange={(e) => update({ stepId: e.target.value })}>
              {steps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {i + 1}. {s.title}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-start`}>Rang 1 du diagramme au rang de l’étape</Label>
            <Input id={`${id}-start`} className="h-10" inputMode="numeric" maxLength={4} value={form.startRow} onChange={(e) => update({ startRow: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand" checked={form.repeats} onChange={(e) => update({ repeats: e.target.checked })} />
            Recommencer le diagramme après le dernier rang
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-brand" checked={form.flat} onChange={(e) => update({ flat: e.target.checked })} />
            Tricot à plat (allers-retours) : rangs pairs sur l’envers, lus de gauche à droite
          </label>
          <label className={cn('flex items-center gap-2', !form.flat && 'text-muted-foreground')}>
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={form.flat && form.oddOnly}
              disabled={!form.flat}
              onChange={(e) => update({ oddOnly: e.target.checked })}
            />
            Seuls les rangs endroit sont dessinés (une ligne pour deux rangs)
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" className="h-10" onClick={() => void save()} disabled={saving || !imageUrl}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

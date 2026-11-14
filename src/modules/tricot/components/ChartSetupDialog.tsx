import { ChevronDown, ChevronUp, Crop, Loader2 } from 'lucide-react'
import { useId, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formToSetup, MAX_CHART_TITLE, moveNearestLine, rowBand, type ChartForm, type ChartSetup } from '../lib/chart'
import { describeSection, planSections, type KnitStep } from '../lib/pattern'

interface Props {
  open: boolean
  /** Image à caler (adresse locale ou temporaire). */
  imageUrl: string | null
  /** Calage de départ : celui du diagramme modifié, ou l'image entière. */
  initial: ChartForm
  steps: Pick<KnitStep, 'id' | 'title' | 'sections' | 'totalRows'>[]
  /** Nouveau diagramme : l'image peut encore être recadrée. */
  onCrop?: () => void
  onCancel: () => void
  /** Renvoie false si l'enregistrement a échoué (la fenêtre reste ouverte). */
  onSave: (setup: ChartSetup) => Promise<boolean>
}

/** Pas d'un bouton de réglage fin, en hauteur d'image. */
const NUDGE = 0.01
/** Écart minimum gardé entre les deux traits. */
const GAP = 0.02

const LINES = [
  { key: 'gridTop' as const, label: 'trait du haut (dernière ligne)' },
  { key: 'gridBottom' as const, label: 'trait du bas (ligne 1)' },
]

/**
 * Calage d'un diagramme, en deux temps : la grille (deux traits glissés du doigt et le nombre de lignes, vérifiés sur
 * l'image), puis où il va dans le projet. Les rangs sont dessinés par-dessus l'image pour vérifier qu'ils tombent juste.
 */
export function ChartSetupDialog({ open, imageUrl, initial, steps, onCrop, onCancel, onSave }: Props) {
  const [form, setForm] = useState<ChartForm>(initial)
  /** Onglet montré : la grille, ou la place du diagramme dans le projet. */
  const [tab, setTab] = useState<'grille' | 'place'>('grille')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const id = useId()

  const update = (patch: Partial<ChartForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError(null)
  }

  /** Monte ou descend un trait d'un pas, sans croiser l'autre : le réglage fin, et le seul geste au clavier. */
  function nudge(key: 'gridTop' | 'gridBottom', by: number) {
    update(
      key === 'gridTop'
        ? { gridTop: Math.min(Math.max(form.gridTop + by, 0), form.gridBottom - GAP) }
        : { gridBottom: Math.max(Math.min(form.gridBottom + by, 1), form.gridTop + GAP) },
    )
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
      // Le problème est montré là où il se règle.
      setTab(setup.startsWith('Lignes') || setup.startsWith('Place') ? 'grille' : 'place')
      return
    }
    setSaving(true)
    try {
      await onSave(setup)
    } finally {
      setSaving(false)
    }
  }

  // Sous-étapes de l'étape choisie, aux rangs connus : la choisir cale le diagramme sur elle
  const step = steps.find((s) => s.id === form.stepId)
  const substeps = step ? planSections(step.sections, step.totalRows).filter((p) => p.start !== null) : []
  const chosen = substeps.findIndex((p) => (form.sectionId ? p.section.id === form.sectionId : p.index === form.sectionIndex))

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

        <Tabs value={tab} onValueChange={(value) => setTab(value as 'grille' | 'place')} className="gap-3">
          <TabsList aria-label="Réglage du diagramme" className="w-full">
            <TabsTrigger value="grille">La grille</TabsTrigger>
            <TabsTrigger value="place">Où il va</TabsTrigger>
          </TabsList>

          <TabsContent value="grille" className="grid gap-3">
            {onCrop && (
              <Button type="button" variant="outline" className="h-10 justify-self-start" onClick={onCrop} disabled={saving}>
                <Crop /> Recadrer l’image
              </Button>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-rows`}>Lignes de la grille</Label>
              <Input id={`${id}-rows`} className="h-10 max-w-28" inputMode="numeric" maxLength={3} value={form.rows} onChange={(e) => update({ rows: e.target.value })} />
            </div>
            {/* Les traits se glissent sur l'image ; ces boutons sont le réglage fin, et le seul geste au clavier. */}
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Les deux traits</p>
              <p className="text-xs text-muted-foreground">Glisse-les sur l’image, ou ajuste-les ici.</p>
              {LINES.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
                  <Button type="button" variant="outline" size="icon-touch" aria-label={`Monter le ${label}`} onClick={() => nudge(key, -NUDGE)}>
                    <ChevronUp />
                  </Button>
                  <Button type="button" variant="outline" size="icon-touch" aria-label={`Descendre le ${label}`} onClick={() => nudge(key, NUDGE)}>
                    <ChevronDown />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="place" className="grid gap-3 sm:grid-cols-2">
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
            {substeps.length > 0 && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}-substep`}>Sous-étape</Label>
                <NativeSelect
                  id={`${id}-substep`}
                  value={chosen === -1 ? '' : String(chosen)}
                  onChange={(e) => {
                    const p = substeps[Number(e.target.value)]
                    // Suivie : ses rangs feront foi, même si sa longueur change ensuite
                    if (p) update({ startRow: String(p.start), endRow: p.end === null ? '' : String(p.end), sectionId: p.section.id, sectionIndex: p.section.id ? undefined : p.index })
                    else update({ sectionId: undefined, sectionIndex: undefined })
                  }}
                >
                  <option value="">Rangs choisis à la main</option>
                  {substeps.map((p, i) => (
                    <option key={p.index} value={i}>
                      {p.index + 1}. {describeSection(p.section)} ({p.end === null ? `dès le rang ${p.start}` : `rangs ${p.start} à ${p.end}`})
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-start`}>Rang 1 du diagramme au rang de l’étape</Label>
              <Input id={`${id}-start`} className="h-10" inputMode="numeric" maxLength={4} value={form.startRow} onChange={(e) => update({ startRow: e.target.value, sectionId: undefined, sectionIndex: undefined })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-end`}>Dernier rang (facultatif)</Label>
              <Input id={`${id}-end`} className="h-10" inputMode="numeric" maxLength={4} placeholder="fin de l’étape" value={form.endRow ?? ''} onChange={(e) => update({ endRow: e.target.value })} />
            </div>
            {/* Les cases du projet : même cible au doigt et même focus que partout ailleurs. */}
            <div className="grid gap-3 text-sm sm:col-span-2">
              <div className="flex items-start gap-2.5">
                <Checkbox id={`${id}-repeats`} className="mt-0.5" checked={form.repeats} onCheckedChange={(checked) => update({ repeats: checked === true })} />
                <Label htmlFor={`${id}-repeats`} className="font-normal">
                  Recommencer le diagramme après le dernier rang
                </Label>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox id={`${id}-flat`} className="mt-0.5" checked={form.flat} onCheckedChange={(checked) => update({ flat: checked === true })} />
                <Label htmlFor={`${id}-flat`} className="font-normal">
                  Tricot à plat (allers-retours) : rangs pairs sur l’envers, lus de gauche à droite
                </Label>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={`${id}-odd-only`}
                  className="mt-0.5"
                  checked={form.flat && form.oddOnly}
                  disabled={!form.flat}
                  onCheckedChange={(checked) => update({ oddOnly: checked === true })}
                />
                <Label htmlFor={`${id}-odd-only`} className={cn('font-normal', !form.flat && 'text-muted-foreground')}>
                  Seuls les rangs endroit sont dessinés (une ligne pour deux rangs)
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="sticky bottom-0 z-10">
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

// Laine et échantillon d'un projet : laines utilisées (saisies ou lues sur la photo de l'étiquette) et échantillons
// du patron et de la tricoteuse, qui recalculent les mailles et les rangs affichés dans les étapes.

import { NeedleGaugesForm } from './NeedleGaugesForm'
import type { NeedleGauge } from '../lib/needleGauges'
import { Camera, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useAsync } from '@/hooks/useAsync'
import { useOnOpen } from '@/hooks/useOnOpen'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/image'
import {
  EMPTY_YARN,
  formatGauge,
  MAX_YARNS,
  parseGauge,
  parseYarn,
  toYarnDraft,
  totalLength,
  YARN_TEXT_MAX,
  yarnDetails,
  yarnTitle,
  type Gauge,
  type StashItem,
  type Yarn,
  type YarnDraft,
} from '../lib/yarn'
import { Fold } from './Fold'
import { HelpTip } from './HelpTip'

export interface ProjectInfo {
  yarns: Yarn[]
  patternGauge: Gauge
  myGauge: Gauge
}

const FIELDS: { key: keyof YarnDraft; label: string; placeholder?: string; numeric?: boolean; unit?: string }[] = [
  { key: 'brand', label: 'Marque', placeholder: 'Phildar' },
  { key: 'name', label: 'Nom de la laine', placeholder: 'Partner 3.5' },
  { key: 'color', label: 'Coloris', placeholder: '0012 Ciel' },
  { key: 'dye_lot', label: 'N° de bain' },
  { key: 'composition', label: 'Composition', placeholder: '100 % mérinos' },
  { key: 'weight_g', label: 'Poids d’une pelote', numeric: true, unit: 'g' },
  { key: 'length_m', label: 'Métrage d’une pelote', numeric: true, unit: 'm' },
  { key: 'skeins', label: 'Nombre de pelotes', numeric: true },
  { key: 'needle_mm', label: 'Aiguilles', numeric: true, unit: 'mm' },
]

/**
 * Saisie d'une laine (projet ou stock), remplissable d'après la photo de l'étiquette. `stash` : laines du stock
 * proposées pour préremplir (laine d'un projet prise dans le stock).
 */
export function YarnDialog({
  yarn,
  open,
  onOpenChange,
  onSave,
  title,
  stash = [],
}: {
  yarn: Yarn | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (yarn: Yarn) => Promise<boolean>
  title?: string
  stash?: StashItem[]
}) {
  const api = useApi()
  const [draft, setDraft] = useState<YarnDraft>(() => toYarnDraft(yarn ?? EMPTY_YARN))
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)

  useOnOpen(open, () => {
    setDraft(toYarnDraft(yarn ?? EMPTY_YARN))
    setError(null)
  })

  async function readLabel(photo: File | undefined) {
    if (!photo) return
    setReading(true)
    setError(null)
    try {
      const read = await api.knitting.readYarnLabel(photo)
      // Les champs lus remplacent ceux saisis ; le nombre de pelotes reste celui saisi.
      setDraft((current) => {
        const filled = toYarnDraft(read)
        return Object.fromEntries(Object.entries(current).map(([k, v]) => [k, filled[k as keyof YarnDraft] || v])) as YarnDraft
      })
      toast.success('Étiquette lue : vérifie les champs')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setReading(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseYarn(draft)
    if ('error' in parsed) return setError(parsed.error)
    setSaving(true)
    const ok = await onSave(parsed.yarn)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <DialogHeader>
            <DialogTitle>{title ?? (yarn ? 'Modifier la laine' : 'Ajouter une laine')}</DialogTitle>
            <DialogDescription>Tous les champs sont facultatifs. La photo de l’étiquette les remplit pour toi.</DialogDescription>
          </DialogHeader>

          {!yarn && stash.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="yarn-from-stash">Prendre dans mon stock</Label>
              <NativeSelect
                id="yarn-from-stash"
                defaultValue=""
                onChange={(e) => {
                  const picked = stash.find((s) => s.id === e.target.value)
                  if (picked) setDraft(toYarnDraft(picked.yarn))
                }}
              >
                <option value="">Choisir une laine…</option>
                {stash.map((s) => (
                  <option key={s.id} value={s.id}>
                    {[yarnTitle(s.yarn), s.yarn.color].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div>
            <Label htmlFor="yarn-label-photo" className="sr-only">
              Photo de l’étiquette
            </Label>
            <input
              id="yarn-label-photo"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void readLabel(e.target.files?.[0])
                e.target.value = ''
              }}
              disabled={reading}
            />
            <Button type="button" variant="outline" className="h-10 w-full" disabled={reading} onClick={() => document.getElementById('yarn-label-photo')?.click()}>
              {reading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera />}
              {reading ? 'Lecture de l’étiquette…' : 'Photo de l’étiquette'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <div key={field.key} className={field.numeric ? 'space-y-1.5' : 'col-span-2 space-y-1.5 sm:col-span-1'}>
                <Label htmlFor={`yarn-${field.key}`}>
                  {field.label}
                  {field.unit && <span className="font-normal text-muted-foreground"> ({field.unit})</span>}
                </Label>
                <Input
                  id={`yarn-${field.key}`}
                  className="h-10"
                  inputMode={field.numeric ? 'decimal' : undefined}
                  maxLength={field.numeric ? 10 : YARN_TEXT_MAX}
                  placeholder={field.placeholder}
                  value={draft[field.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
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
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || reading}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const gaugeText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

function GaugeForm({ info, onSave }: { info: ProjectInfo; onSave: (patternGauge: Gauge, myGauge: Gauge) => Promise<boolean> }) {
  const [values, setValues] = useState(() => ({
    patternStitches: gaugeText(info.patternGauge.stitches),
    patternRows: gaugeText(info.patternGauge.rows),
    myStitches: gaugeText(info.myGauge.stitches),
    myRows: gaugeText(info.myGauge.rows),
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, parseGauge(v)])) as Record<keyof typeof values, number | null | undefined>
  const unchanged =
    parsed.patternStitches === info.patternGauge.stitches &&
    parsed.patternRows === info.patternGauge.rows &&
    parsed.myStitches === info.myGauge.stitches &&
    parsed.myRows === info.myGauge.rows

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (Object.values(parsed).some((v) => v === undefined)) return setError('Échantillon : un nombre entre 1 et 100 pour 10 cm.')
    setError(null)
    setSaving(true)
    await onSave({ stitches: parsed.patternStitches!, rows: parsed.patternRows! }, { stitches: parsed.myStitches!, rows: parsed.myRows! })
    setSaving(false)
  }

  const field = (key: keyof typeof values, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`gauge-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`gauge-${key}`} inputMode="decimal" className="h-10" value={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
    </div>
  )

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label="Échantillon" className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Échantillon du patron (pour 10 cm)</legend>
        <div className="grid grid-cols-2 gap-3">
          {field('patternStitches', 'Mailles du patron')}
          {field('patternRows', 'Rangs du patron')}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Ton échantillon (pour 10 cm)</legend>
        <div className="grid grid-cols-2 gap-3">
          {field('myStitches', 'Tes mailles')}
          {field('myRows', 'Tes rangs')}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button type="submit" variant="outline" className="h-10" disabled={saving || unchanged}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer l’échantillon
        </Button>
        <HelpTip label="échantillon">Si les deux diffèrent, les mailles et les rangs des étapes sont recalculés pour ton échantillon.</HelpTip>
      </div>
    </form>
  )
}

/** Laine et échantillon du projet, enregistrés ensemble. */
/** `removedYarn` : position de la laine retirée (ses pesées partent avec elle). */
export function YarnPanel({
  info,
  onSave,
  needleGauges,
  defaultOpen = false,
}: {
  info: ProjectInfo
  onSave: (info: ProjectInfo, removedYarn?: number) => Promise<boolean>
  /** Échantillon par aiguille (projet à plusieurs aiguilles). */
  needleGauges?: { needles: number[]; gauges: NeedleGauge[]; onSave: (gauges: NeedleGauge[]) => Promise<boolean> }
  /** Ouverte d'office (onglet Démarrer). */
  defaultOpen?: boolean
}) {
  const api = useApi()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  // Supprimer une laine emporte ses pesées : on confirme, comme partout ailleurs.
  const [removing, setRemoving] = useState<number | null>(null)
  // Stock de laine, pour prendre une laine du stock (sans erreur bloquante : le stock est un plus).
  const stash = useAsync(() => api.knitting.listStash(), [api])
  const total = totalLength(info.yarns)

  const saveYarn = (yarn: Yarn) =>
    onSave({ ...info, yarns: editing === 'new' || editing === null ? [...info.yarns, yarn] : info.yarns.map((y, i) => (i === editing ? yarn : y)) })

  return (
    <Fold
      id="knit-yarn"
      defaultOpen={defaultOpen}
      title="Laine et échantillon"
      summary={[info.yarns.length ? `${info.yarns.length} laine${info.yarns.length > 1 ? 's' : ''}` : 'aucune laine notée', formatGauge(info.myGauge) ?? 'échantillon pas noté']
        .filter(Boolean)
        .join(' · ')}
      action={
        info.yarns.length < MAX_YARNS && (
          <Button variant="outline" className="h-10" onClick={() => setEditing('new')}>
            <Plus /> Ajouter une laine
          </Button>
        )
      }
    >

      {info.yarns.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune laine notée : marque, coloris, bain, métrage… pour racheter la même ou refaire le modèle.</p>
      ) : (
        <ul className="divide-y">
          {info.yarns.map((yarn, index) => (
            <li key={index} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <p className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{yarnTitle(yarn)}</span>
                <span className="text-muted-foreground">{yarnDetails(yarn)}</span>
              </p>
              <Button variant="ghost" size="icon-touch" aria-label={`Modifier ${yarnTitle(yarn)}`} onClick={() => setEditing(index)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-touch" aria-label={`Supprimer ${yarnTitle(yarn)}`} onClick={() => setRemoving(index)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {total !== null && <p className="text-sm text-muted-foreground">Environ {total} m de laine en tout.</p>}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette laine ?"
        description={removing !== null && info.yarns[removing] ? `« ${yarnTitle(info.yarns[removing])} » et ses pesées seront supprimées du projet.` : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (removing !== null) await onSave({ ...info, yarns: info.yarns.filter((_, i) => i !== removing) }, removing)
        }}
      />

      <GaugeForm
        key={JSON.stringify([info.patternGauge, info.myGauge])}
        info={info}
        onSave={(patternGauge, myGauge) => onSave({ ...info, patternGauge, myGauge })}
      />

      {needleGauges && <NeedleGaugesForm key={JSON.stringify([needleGauges.needles, needleGauges.gauges])} needles={needleGauges.needles} gauges={needleGauges.gauges} onSave={needleGauges.onSave} />}

      <YarnDialog
        yarn={typeof editing === 'number' ? (info.yarns[editing] ?? null) : null}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={saveYarn}
        stash={stash.data ?? []}
      />
    </Fold>
  )
}

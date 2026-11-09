// « Patron adapté à moi » (facultatif) : l'IA recalcule mailles, rangs et sections pour l'échantillon noté dans
// « Laine et échantillon » et pour des retouches en texte libre. Avant / après à valider ; ensuite, on bascule
// entre le patron adapté et celui d'origine, qui n'est jamais modifié.

import { Loader2, RotateCcw, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ADAPT_REQUEST_MAX, adaptationPaused, describeChange, type Adaptation, type AdaptedStep } from '../lib/adapt'
import type { KnitProject } from '../lib/pattern'
import { formatGauge, gaugeDiffers } from '../lib/yarn'
import { PanelFold } from './PanelFold'

interface Props {
  project: KnitProject
  /** Taille suivie (celle mise en valeur, sinon celle du projet). */
  size: string
  onSaved: () => Promise<void> | void
}

export function AdaptPanel({ project, size, onSaved }: Props) {
  const api = useApi()
  const adaptation = project.adaptation ?? null
  const [editing, setEditing] = useState(false)
  const [request, setRequest] = useState(adaptation?.request ?? '')
  const [working, setWorking] = useState(false)
  const [preview, setPreview] = useState<AdaptedStep[] | null>(null)
  const [removing, setRemoving] = useState(false)
  const [saving, setSaving] = useState(false)
  const paused = adaptationPaused(adaptation, size)

  const gaugeChanged = gaugeDiffers(project.patternGauge, project.myGauge)
  const myGauge = formatGauge(project.myGauge)
  const canAdapt = gaugeChanged || request.trim() !== ''
  const showForm = adaptation === null || editing

  async function adapt() {
    setWorking(true)
    try {
      setPreview(await api.knitting.adaptPattern({ request: request.trim(), size, patternGauge: project.patternGauge, myGauge: project.myGauge, steps: project.steps }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setWorking(false)
    }
  }

  async function save(next: Adaptation | null, message?: string) {
    setSaving(true)
    try {
      await api.knitting.saveAdaptation(project.id, next)
      if (message) toast.success(message)
      await onSaved()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function accept() {
    if (!preview) return
    if (await save({ request: request.trim(), active: true, at: new Date().toISOString(), size, steps: preview }, 'Tu suis maintenant le patron adapté')) {
      setPreview(null)
      setEditing(false)
    }
  }

  const titleOf = (stepId: string) => project.steps.find((s) => s.id === stepId)?.title ?? 'Étape'
  const originalOf = (stepId: string) => project.steps.find((s) => s.id === stepId) ?? { totalRows: null, stitches: null }

  return (
    <PanelFold id="knit-adapt" title="Patron adapté à moi">
      <div>
        <p className="text-sm text-muted-foreground">Facultatif : mailles, rangs et sections recalculés pour ton échantillon et tes retouches. Le patron d’origine reste disponible.</p>
      </div>

      {adaptation && !editing && (
        <div className="space-y-3">
          <p className="text-sm">
            {adaptation.steps.length} étape{adaptation.steps.length > 1 ? 's' : ''} adaptée{adaptation.steps.length > 1 ? 's' : ''}
            {adaptation.request && <> pour « {adaptation.request} »</>}
            {adaptation.size && <> (taille {adaptation.size})</>}.
          </p>
          {paused && (
            <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">
              Adaptation en pause : elle a été faite pour la taille {adaptation.size}, tu suis maintenant la taille {size}. Refais l’adaptation pour la taille {size}.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="knit-adapt-active"
              checked={adaptation.active}
              disabled={saving || paused}
              onCheckedChange={(checked) => void save({ ...adaptation, active: checked === true })}
            />
            <Label htmlFor="knit-adapt-active">Suivre le patron adapté</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEditing(true)}>
              <RotateCcw /> Refaire l’adaptation
            </Button>
            <Button variant="outline" className="h-10 text-destructive" onClick={() => setRemoving(true)}>
              <Trash2 /> Supprimer l’adaptation
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-3">
          <p className="text-sm">
            {myGauge && gaugeChanged
              ? `Ton échantillon : ${myGauge} (celui du patron : ${formatGauge(project.patternGauge) ?? 'non noté'}).`
              : 'Échantillon identique ou non noté (dans « Laine et échantillon ») : seules tes retouches seront appliquées.'}
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="knit-adapt-request">Retouches (facultatif)</Label>
            <Textarea
              id="knit-adapt-request"
              maxLength={ADAPT_REQUEST_MAX}
              placeholder="5 cm de plus aux manches, corps plus court de 3 cm…"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!canAdapt || working} onClick={() => void adapt()}>
              {working ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 />}
              {working ? 'Adaptation…' : 'Adapter avec l’IA'}
            </Button>
            {editing && (
              <Button variant="ghost" className="h-10" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            )}
          </div>
          {!canAdapt && <p className="text-xs text-muted-foreground">Note ton échantillon ou écris une retouche pour adapter le patron.</p>}
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle>Patron adapté</DialogTitle>
          <DialogDescription>Vérifie les changements avant de suivre le patron adapté. Le patron d’origine reste disponible.</DialogDescription>
          <ul aria-label="Étapes adaptées" className="space-y-2">
            {preview?.map((s) => (
              <li key={s.stepId} className="rounded-xl border p-3 text-sm">
                <p className="font-medium">{titleOf(s.stepId)}</p>
                {describeChange(originalOf(s.stepId), s) && <p className="tabular-nums">{describeChange(originalOf(s.stepId), s)}</p>}
                {s.note && <p className="text-muted-foreground">{s.note}</p>}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setPreview(null)}>
              Annuler
            </Button>
            <Button className="h-10" onClick={() => void accept()}>
              <Sparkles /> Suivre ce patron adapté
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Supprimer l’adaptation ?"
        description="Tu reviendras au patron d’origine. Les rangs comptés sont gardés."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (await save(null, 'Adaptation supprimée')) setRequest('')
        }}
      />
    </PanelFold>
  )
}

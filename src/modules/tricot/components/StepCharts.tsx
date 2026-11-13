import { FileText, Grid3x3, ImagePlus, Plus } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PhotoEditor } from '@/components/recipes/PhotoEditor'
import { Button } from '@/components/ui/button'
import { ACCEPTED_IMAGE_TYPES, editImage } from '@/lib/image'
import { FULL_CROP } from '@/lib/photoEdit'
import { CHART_MAX_SIDE, MAX_CHART_IMAGE_BYTES, newChartForm, setupToForm, type ChartHint, type ChartSetup, type KnitChart } from '../lib/chart'
import type { KnitStep } from '../lib/pattern'
import { ChartSetupDialog } from './ChartSetupDialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChartView } from './ChartView'
import { HelpTip } from './HelpTip'
import { PdfPagePicker } from './PdfPagePicker'

interface Props {
  projectId: string
  /** PDF du patron : le diagramme peut être pris sur une de ses pages. */
  pdfPath: string | null
  step: KnitStep
  steps: KnitStep[]
  /** Diagrammes du projet (ceux de l'étape sont affichés). */
  charts: KnitChart[]
  /** Diagrammes repérés à la lecture du patron. */
  hints: ChartHint[]
  /** Après un ajout, un réglage ou une suppression : recharge le projet. */
  onChanged: () => Promise<void>
  /** Donne un identifiant à la sous-étape `index` de l'étape (pour qu'un diagramme la suive) ; null : échec. */
  identifySection?: (stepId: string, index: number) => Promise<string | null>
}

/** Image choisie pour un nouveau diagramme, recadrée ou non. */
interface Draft {
  file: File
  url: string
  /** Page du PDF repérée à la lecture : calage pré-rempli. */
  hint: ChartHint | null
}

/** Diagrammes de l'étape (préparation) : calage, réglage, et ajout d'un diagramme depuis le PDF ou une image. */
export function StepCharts({ projectId, pdfPath, step, steps, charts, hints, onChanged, identifySection }: Props) {
  const api = useApi()
  const inputId = useId()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cropping, setCropping] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<KnitChart | null>(null)
  const [deleting, setDeleting] = useState<KnitChart | null>(null)
  const shown = charts.filter((c) => c.stepId === step.id)

  // L'adresse locale de l'image est libérée quand l'image change ou que la fenêtre se ferme.
  useEffect(() => {
    if (!draft) return
    return () => URL.revokeObjectURL(draft.url)
  }, [draft])

  function choose(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) toast.error('Choisis une image (capture d’écran ou photo).')
    else if (file.size > MAX_CHART_IMAGE_BYTES) toast.error('Image trop lourde (20 Mo au plus).')
    else setDraft({ file, url: URL.createObjectURL(file), hint: null })
  }

  /** Sous-étape choisie sans identifiant : elle en reçoit un, que le diagramme garde pour la suivre. */
  async function linked(setup: ChartSetup): Promise<ChartSetup> {
    const { sectionIndex, ...rest } = setup
    if (sectionIndex === undefined || !rest.stepId || !identifySection) return rest
    const sectionId = await identifySection(rest.stepId, sectionIndex)
    return sectionId ? { ...rest, sectionId } : rest
  }

  async function add(raw: ChartSetup): Promise<boolean> {
    if (!draft) return false
    try {
      const setup = await linked(raw)
      // JPEG réduit à une taille qui reste nette au zoom.
      const image = await editImage(draft.file, { rotation: 0, crop: FULL_CROP, maxSide: CHART_MAX_SIDE }).catch(() => {
        throw new Error('L’image n’a pas pu être lue.')
      })
      await api.knitting.addChart(projectId, image, setup)
      setDraft(null)
      toast.success('Diagramme ajouté')
      await onChanged()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function update(chart: KnitChart, raw: ChartSetup): Promise<boolean> {
    try {
      const setup = await linked(raw)
      await api.knitting.updateChart(chart.id, setup)
      setEditing(null)
      await onChanged()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function remove(chart: KnitChart) {
    try {
      await api.knitting.deleteChart(chart)
      toast.success('Diagramme supprimé')
      await onChanged()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section aria-labelledby={`charts-${step.id}`} className="space-y-3">
      <div className="flex items-center gap-1">
        <h3 id={`charts-${step.id}`} className="flex items-center gap-1.5 text-sm font-medium">
          <Grid3x3 className="size-4" aria-hidden /> Diagrammes
        </h3>
        <HelpTip label="diagrammes">Un diagramme calé sur une sous-étape la suit : ses rangs se recalculent avec elle, et il la suit si elle change d’étape.</HelpTip>
      </div>
      {shown.length === 0 && <p className="text-xs text-muted-foreground">Aucun diagramme pour cette étape.</p>}
      {shown.map((chart) => (
        <ChartView key={chart.id} chart={chart} rowCount={step.rowCount} onEdit={() => setEditing(chart)} onDelete={() => setDeleting(chart)} />
      ))}

      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className="sr-only">
          Image du diagramme
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          className="sr-only"
          onChange={(e) => {
            choose(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {pdfPath ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" className="h-10" />}>
              <Plus /> Ajouter un diagramme
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setPicking(true)}>
                <FileText /> Depuis le PDF du patron
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => document.getElementById(inputId)?.click()}>
                <ImagePlus /> Depuis une image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button type="button" variant="outline" className="h-10" onClick={() => document.getElementById(inputId)?.click()}>
            <Plus /> Ajouter un diagramme
          </Button>
        )}
      </div>

      {picking && pdfPath && (
        <PdfPagePicker
          load={() => api.knitting.downloadPdf(pdfPath, 'patron')}
          hints={hints}
          onCancel={() => setPicking(false)}
          onPick={(image, page) => {
            setPicking(false)
            // Une page entière : on recadre d'abord sur le diagramme.
            setDraft({ file: image, url: URL.createObjectURL(image), hint: hints.find((h) => h.page === page) ?? null })
            setCropping(true)
          }}
        />
      )}
      {draft && !cropping && (
        <ChartSetupDialog
          key={draft.url}
          open
          imageUrl={draft.url}
          initial={newChartForm(step.id, draft.hint, steps)}
          steps={steps}
          onCrop={() => setCropping(true)}
          onCancel={() => setDraft(null)}
          onSave={add}
        />
      )}
      {draft && cropping && (
        <PhotoEditor
          key={draft.url}
          photo={{ kind: 'new', key: draft.url, file: draft.file, url: draft.url }}
          onClose={() => setCropping(false)}
          onSave={(file) => setDraft({ ...draft, file, url: URL.createObjectURL(file) })}
        />
      )}
      {editing && (
        <ChartSetupDialog
          key={editing.id}
          open
          imageUrl={editing.imageUrl}
          initial={setupToForm({ ...editing, stepId: editing.stepId ?? step.id })}
          steps={steps}
          onCancel={() => setEditing(null)}
          onSave={(setup) => update(editing, setup)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Supprimer le diagramme ?"
        description="L’image et son calage seront supprimés. Le compteur de rangs ne change pas."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleting) await remove(deleting)
        }}
      />
    </section>
  )
}

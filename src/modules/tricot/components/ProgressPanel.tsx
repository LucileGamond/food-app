// Notes et photos d'avancement d'un projet de tricot : modifications faites au patron, essais… et photos prises au fil
// du projet (rattachées à l'étape en cours), à légender, agrandir ou supprimer.

import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadError } from '@/components/LoadError'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAsync } from '@/hooks/useAsync'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { ACCEPTED_IMAGE_TYPES, compressImage } from '@/lib/image'
import { CAPTION_MAX, describePhoto, PROJECT_NOTES_MAX, type ProgressPhoto } from '../lib/progress'
import { PanelFold } from './PanelFold'

interface Props {
  projectId: string
  /** Étape en cours : les nouvelles photos y sont rattachées. */
  currentStepId: string | null
  stepTitle: (stepId: string) => string | undefined
}

export function ProgressPanel({ projectId, currentStepId, stepTitle }: Props) {
  const api = useApi()
  const progress = useAsync(() => api.knitting.getProgress(projectId), [api, projectId])
  const photos = progress.data?.photos ?? []
  const urls = useSignedUrls(api.knitting.progressPhotoUrls, photos.map((p) => p.storagePath))
  const [notes, setNotes] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null)
  const [removing, setRemoving] = useState<ProgressPhoto | null>(null)

  // Notes saisies (sinon celles enregistrées), enregistrées en quittant le champ.
  const shownNotes = notes ?? progress.data?.notes ?? ''

  async function saveNotes() {
    if (notes === null || notes === progress.data?.notes) return
    try {
      await api.knitting.saveProjectNotes(projectId, notes)
      progress.setData((d) => d && { ...d, notes })
      setNotes(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return
    setAdding(true)
    try {
      await api.knitting.addProgressPhoto(projectId, await compressImage(file), { stepId: currentStepId, caption: '' })
      toast.success('Photo ajoutée')
      progress.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  async function saveCaption(photo: ProgressPhoto, caption: string) {
    const trimmed = caption.trim()
    if (trimmed === photo.caption) return
    try {
      await api.knitting.saveCaption(photo.id, trimmed)
      progress.setData((d) => d && { ...d, photos: d.photos.map((p) => (p.id === photo.id ? { ...p, caption: trimmed } : p)) })
      setViewing((v) => (v?.id === photo.id ? { ...v, caption: trimmed } : v))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await api.knitting.deleteProgressPhoto(removing)
      setViewing(null)
      progress.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <PanelFold
      id="knit-progress"
      title="Notes et photos"
      action={
        <div>
          <Label htmlFor="knit-progress-photo" className="sr-only">
            Ajouter une photo d’avancement
          </Label>
          <input
            id="knit-progress-photo"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            capture="environment"
            className="sr-only"
            disabled={adding}
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button variant="outline" className="h-10" disabled={adding || !progress.data} onClick={() => document.getElementById('knit-progress-photo')?.click()}>
            {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Camera />}
            {adding ? 'Envoi…' : 'Photo d’avancement'}
          </Button>
        </div>
      }
    >

      {progress.error ? (
        <LoadError message={progress.error} onRetry={progress.reload} />
      ) : !progress.data ? (
        <Skeleton className="h-24 rounded-xl" aria-busy="true" aria-label="Chargement des notes et photos" />
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="knit-project-notes">Notes du projet</Label>
            <Textarea
              id="knit-project-notes"
              maxLength={PROJECT_NOTES_MAX}
              placeholder="Modifications faites au patron, essais, pour qui…"
              value={shownNotes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
            />
          </div>

          {photos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImagePlus className="size-4 shrink-0" aria-hidden /> Aucune photo : garde une trace de chaque étape.
            </p>
          ) : (
            <ul aria-label="Photos d’avancement" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(photo)}
                    aria-label={`Voir la photo : ${photo.caption || describePhoto(photo, stepTitle)}`}
                    className="block aspect-square w-full overflow-hidden rounded-xl bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {urls[photo.storagePath] && <img src={urls[photo.storagePath]} alt="" className="size-full object-cover" />}
                  </button>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{photo.caption || describePhoto(photo, stepTitle)}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          {viewing && (
            <>
              <DialogTitle className="sr-only">Photo d’avancement</DialogTitle>
              <DialogDescription>{describePhoto(viewing, stepTitle)}</DialogDescription>
              {urls[viewing.storagePath] && <img src={urls[viewing.storagePath]} alt={viewing.caption || 'Photo d’avancement'} className="max-h-[65dvh] w-full rounded-xl object-contain" />}
              <div className="grid gap-1.5">
                <Label htmlFor="knit-photo-caption">Légende</Label>
                <Input
                  key={viewing.id}
                  id="knit-photo-caption"
                  className="h-10"
                  maxLength={CAPTION_MAX}
                  defaultValue={viewing.caption}
                  placeholder="Fin du dos, essai de torsade…"
                  onBlur={(e) => void saveCaption(viewing, e.target.value)}
                />
              </div>
              <Button variant="outline" className="h-10 justify-self-start text-destructive" onClick={() => setRemoving(viewing)}>
                <Trash2 /> Supprimer la photo
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette photo ?"
        description="Elle sera supprimée définitivement."
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </PanelFold>
  )
}

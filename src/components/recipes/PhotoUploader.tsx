import { Camera, Crop, ImagePlus, Star, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/image'
import { cn } from '@/lib/utils'
import { PhotoEditor } from './PhotoEditor'

/** Photo affichée dans le formulaire : déjà enregistrée, ou nouvelle (pas encore envoyée). */
export type PhotoDraft =
  | { kind: 'existing'; key: string; id: string; storage_path: string; url: string | undefined }
  | { kind: 'new'; key: string; file: File; url: string }

interface Props {
  photos: PhotoDraft[]
  onAdd: (files: File[]) => void
  onRemove: (key: string) => void
  onMakeMain: (key: string) => void
  /** Photo retouchée (tournée, recadrée) : remplace l'ancienne. Absent : pas de retouche proposée. */
  onEdit?: (key: string, file: File) => void
}

/** Écran tactile (téléphone, tablette) : un appareil photo à ouvrir directement. Sur ordinateur, le bouton ferait doublon. */
function hasCamera(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true
}

export function PhotoUploader({ photos, onAdd, onRemove, onMakeMain, onEdit }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<PhotoDraft | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const add = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
    if (files.length > 0) onAdd(files)
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <li key={photo.key} data-testid="photo-item" className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
              {photo.url && <img src={photo.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />}
              {i === 0 && (
                <span className="absolute bottom-1 left-1 rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium">Principale</span>
              )}
              <div className="absolute top-1 right-1 flex gap-1">
                {i > 0 && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`Utiliser la photo ${i + 1} comme photo principale`}
                    onClick={() => onMakeMain(photo.key)}
                  >
                    <Star />
                  </Button>
                )}
                {onEdit && photo.url && (
                  <Button type="button" size="icon-sm" variant="secondary" aria-label={`Retoucher la photo ${i + 1}`} onClick={() => setEditing(photo)}>
                    <Crop />
                  </Button>
                )}
                <Button type="button" size="icon-sm" variant="secondary" aria-label={`Retirer la photo ${i + 1}`} onClick={() => onRemove(photo.key)}>
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        multiple
        className="sr-only"
        aria-label="Choisir des photos"
        tabIndex={-1}
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      {/* capture : ouvre l'appareil photo (arrière) au lieu de la galerie. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Prendre une photo avec l’appareil"
        tabIndex={-1}
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className={cn('h-10')} onClick={() => input.current?.click()}>
          <ImagePlus /> Ajouter des photos
        </Button>
        {hasCamera() && (
          <Button type="button" variant="outline" className="h-10" onClick={() => camera.current?.click()}>
            <Camera /> Prendre une photo
          </Button>
        )}
      </div>
      {onEdit && <PhotoEditor key={editing?.key ?? 'aucune'} photo={editing} onClose={() => setEditing(null)} onSave={(file) => editing && onEdit(editing.key, file)} />}
    </div>
  )
}

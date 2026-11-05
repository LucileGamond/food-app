import { ImagePlus, Star, X } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ACCEPTED_IMAGE_TYPES } from '@/lib/image'
import type { PhotoDraft } from '../hooks/usePhotoDrafts'

interface Props {
  drafts: PhotoDraft[]
  /** URL des photos déjà enregistrées. */
  urls: Record<string, string>
  onAdd: (files: File[]) => void
  onRemove: (draft: PhotoDraft) => void
  onMakeMain: (key: string) => void
}

export function PlantPhotos({ drafts, urls, onAdd, onRemove, onMakeMain }: Props) {
  const input = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-3">
      {drafts.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Photos de la plante">
          {drafts.map((draft, i) => {
            const url = draft.kind === 'new' ? draft.url : urls[draft.photo.storage_path]
            return (
              <li key={draft.key} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                {url && <img src={url} alt={`Photo ${i + 1}`} className="size-full object-cover" />}
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium">Principale</span>}
                <div className="absolute top-1 right-1 flex gap-1">
                  {i > 0 && (
                    <Button type="button" size="icon-sm" variant="secondary" aria-label={`Utiliser la photo ${i + 1} comme photo principale`} onClick={() => onMakeMain(draft.key)}>
                      <Star />
                    </Button>
                  )}
                  <Button type="button" size="icon-sm" variant="secondary" aria-label={`Retirer la photo ${i + 1}`} onClick={() => onRemove(draft)}>
                    <X />
                  </Button>
                </div>
              </li>
            )
          })}
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
          const files = [...(e.target.files ?? [])].filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type))
          if (files.length > 0) onAdd(files)
          e.target.value = ''
        }}
      />
      <Button type="button" variant="outline" className="h-10" onClick={() => input.current?.click()}>
        <ImagePlus /> Ajouter des photos
      </Button>
    </div>
  )
}

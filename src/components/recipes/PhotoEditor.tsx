import { Loader2, RotateCcw, RotateCw, Undo2, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { editImage } from '@/lib/image'
import { cropFromDrag, FULL_CROP, isFullCrop, isUnchanged, rotateCrop, turn, type Crop, type Rotation } from '@/lib/photoEdit'
import { detectRotation } from '@/services/uprightPhoto'
import type { PhotoDraft } from './PhotoUploader'

/** Taille de l'aperçu (côté long) : assez pour viser, léger à redessiner à chaque quart de tour. */
const PREVIEW_SIDE = 900

interface Props {
  /** Photo à retoucher ; null : fenêtre fermée. */
  photo: PhotoDraft | null
  onClose: () => void
  onSave: (file: File) => void
}

/** Image d'origine : la photo choisie, ou la photo enregistrée téléchargée. */
async function sourceOf(photo: PhotoDraft): Promise<Blob> {
  if (photo.kind === 'new') return photo.file
  if (!photo.url) throw new Error('Photo indisponible.')
  const response = await fetch(photo.url)
  if (!response.ok) throw new Error('Photo indisponible.')
  return response.blob()
}

/** Retouche d'une photo : quart de tour à gauche ou à droite, recadrage en traçant un cadre du doigt. */
export function PhotoEditor({ photo, onClose, onSave }: Props) {
  const [source, setSource] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [rotation, setRotation] = useState<Rotation>(0)
  const [crop, setCrop] = useState<Crop>(FULL_CROP)
  const [drawing, setDrawing] = useState<Crop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const api = useApi()
  const frame = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  // Une fenêtre par photo (clé posée par PhotoUploader) : l'état repart de zéro à chaque photo.
  useEffect(() => {
    if (!photo) return
    let cancelled = false
    sourceOf(photo).then(
      (blob) => !cancelled && setSource(blob),
      () => !cancelled && setError('La photo n’a pas pu être chargée.'),
    )
    return () => {
      cancelled = true
    }
  }, [photo])

  // Aperçu de l'image tournée (le cadre est dessiné par-dessus).
  useEffect(() => {
    if (!source) return
    let url: string | null = null
    let cancelled = false
    editImage(source, { rotation, crop: FULL_CROP, maxSide: PREVIEW_SIDE }).then(
      (file) => {
        if (cancelled) return
        url = URL.createObjectURL(file)
        setPreview(url)
      },
      () => !cancelled && setError('La photo n’a pas pu être lue.'),
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [source, rotation])

  /** Sens trouvé par le modèle (4 versions comparées) ; le cadre repart de la photo entière. */
  async function straighten() {
    if (!source) return
    setDetecting(true)
    try {
      const found = await detectRotation(api, source)
      setRotation(found)
      setCrop(FULL_CROP)
      if (found === 0) toast.info('La photo semble déjà à l’endroit.')
    } catch {
      toast.error('Le sens n’a pas pu être détecté : tourne-la à la main.')
    } finally {
      setDetecting(false)
    }
  }

  function rotate(direction: 1 | -1) {
    setRotation((r) => turn(r, direction))
    setCrop((c) => rotateCrop(c, direction))
  }

  /** Position du doigt en fractions de l'aperçu. */
  function point(event: PointerEvent) {
    const box = frame.current!.getBoundingClientRect()
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    start.current = point(event)
  }

  function move(event: PointerEvent) {
    if (start.current) setDrawing(cropFromDrag(start.current, point(event)))
  }

  function up(event: PointerEvent) {
    if (!start.current) return
    const traced = cropFromDrag(start.current, point(event))
    start.current = null
    setDrawing(null)
    if (traced) setCrop(traced)
  }

  async function save() {
    if (!source) return
    setSaving(true)
    try {
      onSave(await editImage(source, { rotation, crop }))
      onClose()
    } catch {
      setError('La retouche a échoué : réessaie.')
    } finally {
      setSaving(false)
    }
  }

  const shown = drawing ?? crop
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retoucher la photo</DialogTitle>
          <DialogDescription>Tourne la photo, puis trace du doigt le cadre à garder.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-48 items-center justify-center rounded-lg bg-muted">
          {error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : preview ? (
            <div
              ref={frame}
              className="relative touch-none select-none"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => ((start.current = null), setDrawing(null))}
              data-testid="photo-crop-area"
            >
              <img src={preview} alt="Aperçu de la photo" className="block max-h-[55svh] max-w-full" draggable={false} />
              {!isFullCrop(shown) && (
                <div
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                  style={{
                    left: `${shown.left * 100}%`,
                    top: `${shown.top * 100}%`,
                    width: `${(shown.right - shown.left) * 100}%`,
                    height: `${(shown.bottom - shown.top) * 100}%`,
                  }}
                  aria-hidden
                />
              )}
            </div>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Chargement de la photo" />
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={() => void straighten()} disabled={!preview || detecting}>
            {detecting ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 />} Redresser
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => rotate(-1)} disabled={!preview}>
            <RotateCcw /> Tourner à gauche
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => rotate(1)} disabled={!preview}>
            <RotateCw /> Tourner à droite
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => setCrop(FULL_CROP)} disabled={isFullCrop(crop)}>
            <Undo2 /> Photo entière
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" className="h-10" onClick={() => void save()} disabled={!source || saving || isUnchanged(rotation, crop)}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { movePhoto as moved, type KnitPattern, type PatternFiles, type PatternPhoto } from '../lib/library'

/** Photo affichée dans le formulaire : enregistrée (chemin) ou nouvelle (déjà réduite, avec son aperçu local). */
export interface FormPhoto {
  key: string
  photo: PatternPhoto
  /** Aperçu local d'une nouvelle photo. */
  preview: string | null
}

/**
 * Fichiers du formulaire d'un patron : PDF et photos, enregistrés (gardés ou retirés) et nouveaux (envoyés à
 * l'enregistrement), dans l'ordre choisi (la première photo sert de couverture). Les aperçus locaux sont libérés en partant.
 */
export function usePatternFiles(existing: Pick<KnitPattern, 'pdfPath' | 'photos'> | null) {
  const [pdfPath, setPdfPath] = useState(existing?.pdfPath ?? null)
  const [newPdf, setNewPdf] = useState<File | null>(null)
  const [photos, setPhotos] = useState<FormPhoto[]>(() => (existing?.photos ?? []).map((path) => ({ key: path, photo: path, preview: null })))
  const counter = useRef(0)

  const latest = useRef(photos)
  useEffect(() => {
    latest.current = photos
  }, [photos])
  useEffect(() => () => latest.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [])

  /** Choisit un PDF : il remplace celui du patron. */
  const choosePdf = useCallback((file: File) => {
    setNewPdf(file)
    setPdfPath(null)
  }, [])

  const removePdf = useCallback(() => {
    setNewPdf(null)
    setPdfPath(null)
  }, [])

  const addPhotos = useCallback((blobs: Blob[]) => {
    // Aperçus créés hors de la mise à jour d'état : rejouée deux fois en mode strict, elle en perdrait.
    const added = blobs.map((blob) => ({ key: `new-${++counter.current}`, photo: blob, preview: URL.createObjectURL(blob) }))
    setPhotos((list) => [...list, ...added])
  }, [])

  /** Retire la photo n° `index`, dans l'ordre affiché. */
  const removePhoto = useCallback(
    (index: number) => {
      const photo = photos[index]
      if (!photo) return
      if (photo.preview) URL.revokeObjectURL(photo.preview)
      setPhotos((list) => list.filter((p) => p.key !== photo.key))
    },
    [photos],
  )

  /** Déplace la photo n° `from` en position `to` (0 : couverture). */
  const movePhoto = useCallback((from: number, to: number) => setPhotos((list) => moved(list, from, to)), [])

  const files: PatternFiles = useMemo(() => ({ pdfPath, newPdf, photos: photos.map((p) => p.photo) }), [pdfPath, newPdf, photos])

  return { files, photos, choosePdf, removePdf, addPhotos, removePhoto, movePhoto }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KnitPattern, PatternFiles } from '../lib/library'

/** Nouvelle photo (déjà réduite), avec son aperçu local. */
interface NewPhoto {
  key: string
  blob: Blob
  url: string
}

/**
 * Fichiers du formulaire d'un patron : PDF et photos déjà enregistrés (gardés ou retirés) et nouveaux (envoyés à
 * l'enregistrement). Les aperçus locaux sont libérés en partant.
 */
export function usePatternFiles(existing: Pick<KnitPattern, 'pdfPath' | 'photos'> | null, initialPdf: File | null = null) {
  const [pdfPath, setPdfPath] = useState(existing?.pdfPath ?? null)
  const [newPdf, setNewPdf] = useState<File | null>(initialPdf)
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? [])
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([])
  const counter = useRef(0)

  const latest = useRef(newPhotos)
  useEffect(() => {
    latest.current = newPhotos
  }, [newPhotos])
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

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
    const added = blobs.map((blob) => ({ key: `new-${++counter.current}`, blob, url: URL.createObjectURL(blob) }))
    setNewPhotos((list) => [...list, ...added])
  }, [])

  /** Retire la photo n° `index` (les enregistrées d'abord, puis les nouvelles, comme à l'écran). */
  const removePhoto = useCallback(
    (index: number) => {
      if (index < photos.length) return setPhotos((list) => list.filter((_, i) => i !== index))
      const photo = newPhotos[index - photos.length]
      if (!photo) return
      URL.revokeObjectURL(photo.url)
      setNewPhotos((list) => list.filter((p) => p.key !== photo.key))
    },
    [photos.length, newPhotos],
  )

  const files: PatternFiles = useMemo(() => ({ pdfPath, newPdf, photos, newPhotos: newPhotos.map((p) => p.blob) }), [pdfPath, newPdf, photos, newPhotos])

  return { files, newPhotoPreviews: newPhotos, choosePdf, removePdf, addPhotos, removePhoto }
}

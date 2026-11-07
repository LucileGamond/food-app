import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhotoDraft } from '@/components/recipes/PhotoUploader'
import type { RecipePhoto } from '@/lib/recipes'

/**
 * Photos du formulaire de recette : déjà enregistrées ou nouvelles (aperçu local), retirées, photo principale (la
 * première). Les aperçus locaux sont libérés en partant.
 */
export function useRecipePhotos() {
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [removed, setRemoved] = useState<PhotoDraft[]>([])
  const keyCounter = useRef(0)

  const latest = useRef(photos)
  useEffect(() => {
    latest.current = photos
  }, [photos])
  useEffect(() => () => latest.current.forEach((p) => p.kind === 'new' && URL.revokeObjectURL(p.url)), [])

  /** Photos de la recette chargée, avec leurs URL d'affichage. */
  const load = useCallback((saved: Pick<RecipePhoto, 'id' | 'storage_path'>[], urls: Record<string, string>) => {
    setPhotos(saved.map((p) => ({ kind: 'existing', key: p.id, id: p.id, storage_path: p.storage_path, url: urls[p.storage_path] })))
  }, [])

  const add = useCallback((files: File[]) => {
    // Aperçus créés hors de la mise à jour d'état : rejouée deux fois en mode strict, elle en perdrait.
    const added = files.map((file) => ({ kind: 'new' as const, key: `new-${++keyCounter.current}`, file, url: URL.createObjectURL(file) }))
    setPhotos((list) => [...list, ...added])
  }, [])

  const remove = useCallback((key: string) => {
    const photo = latest.current.find((p) => p.key === key)
    if (!photo) return
    if (photo.kind === 'existing') setRemoved((r) => [...r, photo])
    else URL.revokeObjectURL(photo.url)
    setPhotos((list) => list.filter((p) => p.key !== key))
  }, [])

  const makeMain = useCallback((key: string) => {
    setPhotos((list) => {
      const photo = list.find((p) => p.key === key)
      return photo ? [photo, ...list.filter((p) => p.key !== key)] : list
    })
  }, [])

  /**
   * Photo retouchée (tournée, recadrée) : remplace l'ancienne à la même place. Une photo déjà enregistrée sera supprimée
   * et la nouvelle envoyée à l'enregistrement de la recette.
   */
  const replace = useCallback((key: string, file: File) => {
    const photo = latest.current.find((p) => p.key === key)
    if (!photo) return
    if (photo.kind === 'existing') setRemoved((r) => [...r, photo])
    else URL.revokeObjectURL(photo.url)
    const edited = { kind: 'new' as const, key: `new-${++keyCounter.current}`, file, url: URL.createObjectURL(file) }
    setPhotos((list) => list.map((p) => (p.key === key ? edited : p)))
  }, [])

  /** Photos à jour, même après des `await` (une photo a pu être ajoutée entre-temps). */
  const hasPhotos = useCallback(() => latest.current.length > 0, [])

  /** Photo envoyée : devient « enregistrée », pour ne pas être renvoyée si l'enregistrement est relancé. */
  const markUploaded = useCallback((key: string, uploaded: Pick<RecipePhoto, 'id' | 'storage_path'>) => {
    setPhotos((list) => list.map((p) => (p.key === key ? { kind: 'existing', key, id: uploaded.id, storage_path: uploaded.storage_path, url: p.url } : p)))
  }, [])

  const clearRemoved = useCallback(() => setRemoved([]), [])

  return { photos, removed, load, add, remove, replace, makeMain, hasPhotos, markUploaded, clearRemoved }
}

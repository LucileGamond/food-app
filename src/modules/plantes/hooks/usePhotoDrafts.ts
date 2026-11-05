import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlantPhoto } from '../lib/plants'

/** Photo du formulaire : déjà enregistrée, ou nouvelle (envoyée à l'enregistrement). */
export type PhotoDraft = { kind: 'saved'; key: string; photo: PlantPhoto } | { kind: 'new'; key: string; file: File; url: string }

/** Photos du formulaire : ajout, retrait, photo principale (la première) ; aperçus locaux libérés en partant. */
export function usePhotoDrafts(saved: PlantPhoto[]) {
  const [drafts, setDrafts] = useState<PhotoDraft[]>(() => saved.map((photo) => ({ kind: 'saved', key: photo.id, photo })))
  const [removed, setRemoved] = useState<PlantPhoto[]>([])
  const counter = useRef(0)

  const latest = useRef(drafts)
  useEffect(() => {
    latest.current = drafts
  }, [drafts])
  useEffect(() => () => latest.current.forEach((d) => d.kind === 'new' && URL.revokeObjectURL(d.url)), [])

  const add = useCallback((files: File[]) => {
    // Aperçus créés hors de la mise à jour d'état : rejouée deux fois en mode strict, elle en perdrait.
    const added = files.map((file): PhotoDraft => ({ kind: 'new', key: `new-${++counter.current}`, file, url: URL.createObjectURL(file) }))
    setDrafts((list) => [...list, ...added])
  }, [])

  const remove = useCallback((draft: PhotoDraft) => {
    if (draft.kind === 'new') URL.revokeObjectURL(draft.url)
    else setRemoved((list) => [...list, draft.photo])
    setDrafts((list) => list.filter((d) => d.key !== draft.key))
  }, [])

  const makeMain = useCallback((key: string) => {
    setDrafts((list) => [...list.filter((d) => d.key === key), ...list.filter((d) => d.key !== key)])
  }, [])

  /** Photo envoyée : un nouvel essai d'enregistrement (après une erreur) ne la renvoie pas. */
  const markUploaded = useCallback((key: string, photo: PlantPhoto) => {
    setDrafts((list) => list.map((d) => (d.key === key ? { kind: 'saved', key, photo } : d)))
  }, [])

  /** Photos retirées supprimées : rien à refaire au prochain enregistrement. */
  const clearRemoved = useCallback(() => setRemoved([]), [])

  return { drafts, removed, add, remove, makeMain, markUploaded, clearRemoved }
}

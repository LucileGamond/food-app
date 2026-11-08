import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { StepProgress } from '../api'
import { clearProgress, isOffline, loadProjectCopy, pendingFor, queueProgress, saveProjectCopy, withPending } from '../lib/offline'
import { MAX_ROW_COUNT, type KnitProject } from '../lib/pattern'

interface KnitProjectState {
  project: KnitProject | null
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  /** Avancée d'une étape : affichée tout de suite, rétablie si l'enregistrement échoue. */
  saveStep: (stepId: string, progress: StepProgress) => Promise<boolean>
  /** Ajoute (ou retire) des rangs à partir de la dernière valeur, même en tapant très vite. */
  countRows: (stepId: string, delta: number) => Promise<boolean>
  /** Sans réseau : la dernière version gardée sur le téléphone est affichée. */
  offline: boolean
  /** Étapes dont l'avancée attend le retour du réseau. */
  pending: number
}

export function useKnitProject(api: Api, id: string): KnitProjectState {
  const [project, setProject] = useState<KnitProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const latest = useRef<KnitProject | null>(null)
  // Enregistrements l'un après l'autre : le dernier rang compté est le dernier écrit.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Chaque version affichée est aussi gardée sur le téléphone, pour tricoter sans réseau.
  const apply = (next: KnitProject | null) => {
    latest.current = next
    setProject(next)
    if (next) saveProjectCopy(next)
  }

  /** Envoie l'avancée mise en attente sans réseau ; s'arrête au premier échec (elle sera renvoyée plus tard). */
  const flush = useCallback(async () => {
    if (isOffline()) return
    for (const [stepId, progress] of pendingFor(id)) {
      try {
        await api.knitting.saveProgress(stepId, progress)
        clearProgress(stepId, progress)
      } catch {
        break
      }
    }
  }, [api, id])

  const reload = useCallback(async () => {
    try {
      await flush()
      const fresh = await api.knitting.getProject(id)
      apply(fresh && withPending(fresh))
      setOffline(false)
      setLoadError(null)
    } catch (error) {
      // Sans réseau : la dernière version gardée sur le téléphone, avec ce qui a été compté depuis.
      const copy = loadProjectCopy(id)
      if (copy) {
        apply(withPending(copy))
        setOffline(true)
        setLoadError(null)
      } else {
        setLoadError(errorMessage(error))
      }
    } finally {
      setLoading(false)
      setPending(pendingFor(id).length)
    }
  }, [api, id, flush])

  useEffect(() => {
    void reload()
    // Retour du réseau : l'avancée en attente part, puis le projet est relu.
    const online = () => void reload()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [reload])

  const saveStep = useCallback(
    async (stepId: string, progress: StepProgress) => {
      const before = latest.current
      if (!before) return false
      const previous = before.steps.find((s) => s.id === stepId)
      if (!previous) return false
      apply({ ...before, steps: before.steps.map((s) => (s.id === stepId ? { ...s, ...progress } : s)) })
      // Sans réseau : gardé sur le téléphone, envoyé au retour du réseau.
      const keep = () => {
        queueProgress(before.id, stepId, progress)
        setPending(pendingFor(before.id).length)
        setOffline(true)
        return true
      }
      if (isOffline()) return keep()
      try {
        const saved = queue.current.then(() => api.knitting.saveProgress(stepId, progress))
        queue.current = saved.catch(() => undefined)
        await saved
        setOffline(false)
        return true
      } catch (error) {
        if (isOffline()) return keep()
        // Rétablit seulement les champs envoyés (une autre modification a pu suivre).
        const current = latest.current
        if (current) {
          const restored = Object.fromEntries(Object.keys(progress).map((key) => [key, previous[key as keyof StepProgress]]))
          apply({ ...current, steps: current.steps.map((s) => (s.id === stepId ? { ...s, ...restored } : s)) })
        }
        toast.error(errorMessage(error))
        return false
      }
    },
    [api],
  )

  const countRows = useCallback(
    (stepId: string, delta: number) => {
      const step = latest.current?.steps.find((s) => s.id === stepId)
      if (!step) return Promise.resolve(false)
      const rowCount = Math.min(MAX_ROW_COUNT, Math.max(0, step.rowCount + delta))
      if (rowCount === step.rowCount) return Promise.resolve(false)
      return saveStep(stepId, { rowCount })
    },
    [saveStep],
  )

  return { project, loading, loadError, reload, saveStep, countRows, offline, pending }
}

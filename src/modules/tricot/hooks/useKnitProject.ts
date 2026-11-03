import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { StepProgress } from '../api'
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
}

export function useKnitProject(api: Api, id: string): KnitProjectState {
  const [project, setProject] = useState<KnitProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latest = useRef<KnitProject | null>(null)
  // Enregistrements l'un après l'autre : le dernier rang compté est le dernier écrit.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const apply = (next: KnitProject | null) => {
    latest.current = next
    setProject(next)
  }

  const reload = useCallback(async () => {
    try {
      apply(await api.knitting.getProject(id))
      setLoadError(null)
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [api, id])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveStep = useCallback(
    async (stepId: string, progress: StepProgress) => {
      const before = latest.current
      if (!before) return false
      const previous = before.steps.find((s) => s.id === stepId)
      if (!previous) return false
      apply({ ...before, steps: before.steps.map((s) => (s.id === stepId ? { ...s, ...progress } : s)) })
      try {
        const saved = queue.current.then(() => api.knitting.saveProgress(stepId, progress))
        queue.current = saved.catch(() => undefined)
        await saved
        return true
      } catch (error) {
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

  return { project, loading, loadError, reload, saveStep, countRows }
}

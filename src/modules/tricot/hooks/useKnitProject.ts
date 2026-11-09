import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppError, errorMessage, type Api } from '@/api'
import type { StepProgress } from '../api'
import { clearProgress, isOffline, loadProjectCopy, pendingFor, queueProgress, saveProjectCopy, settleProgress, withPending } from '../lib/offline'
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

/** Avancée modifiée sur le téléphone, numérotée pour savoir si elle a suivi le lancement d'une relecture. */
interface Edit {
  version: number
  stepId: string
  progress: StepProgress
}

/** Erreur de connexion (réseau faible alors que le navigateur se croit en ligne), et non refus de la base. */
const isNetworkError = (error: unknown) => error instanceof AppError && error.code === 'network'

/** Applique au projet relu les avancées modifiées depuis le lancement de la relecture. */
function withEdits(project: KnitProject, edits: Edit[], since: number): KnitProject {
  const later = edits.filter((e) => e.version > since)
  if (later.length === 0) return project
  return {
    ...project,
    steps: project.steps.map((s) => later.reduce((step, e) => (e.stepId === step.id ? { ...step, ...e.progress } : step), s)),
  }
}

export function useKnitProject(api: Api, id: string): KnitProjectState {
  const [project, setProject] = useState<KnitProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [shownId, setShownId] = useState(id)
  const latest = useRef<KnitProject | null>(null)
  // Écritures et relectures l'une après l'autre : le dernier rang compté est le dernier écrit.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const currentId = useRef(id)
  const version = useRef(0)
  const edits = useRef<Edit[]>([])

  // Autre projet (carte de l'accueil) : rien de l'ancien ne reste affiché.
  if (shownId !== id) {
    setShownId(id)
    setProject(null)
    setLoading(true)
    setLoadError(null)
    setOffline(false)
    setPending(0)
  }

  // Chaque version affichée est aussi gardée sur le téléphone, pour tricoter sans réseau.
  const apply = (next: KnitProject | null) => {
    latest.current = next
    setProject(next)
    if (next) saveProjectCopy(next)
  }

  const edit = (stepId: string, progress: StepProgress) => {
    version.current += 1
    edits.current.push({ version: version.current, stepId, progress })
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

  const reload = useCallback(() => {
    // Ce qui est compté après ce moment est écrit après la relecture : il l'emporte sur la réponse.
    const since = version.current
    const stale = () => currentId.current !== id
    const run = queue.current.then(async () => {
      if (stale()) return
      try {
        await flush()
        const fresh = await api.knitting.getProject(id)
        if (stale()) return
        apply(fresh && withEdits(withPending(fresh), edits.current, since))
        setOffline(false)
        setLoadError(null)
      } catch (error) {
        if (stale()) return
        // Sans réseau : la dernière version gardée sur le téléphone, avec ce qui a été compté depuis.
        const copy = loadProjectCopy(id)
        if (copy) {
          apply(withEdits(withPending(copy), edits.current, since))
          setOffline(true)
          setLoadError(null)
        } else {
          setLoadError(errorMessage(error))
        }
      } finally {
        if (!stale()) {
          edits.current = edits.current.filter((e) => e.version > since)
          setLoading(false)
          setPending(pendingFor(id).length)
        }
      }
    })
    queue.current = run
    return run
  }, [api, id, flush])

  useEffect(() => {
    currentId.current = id
    latest.current = null
    edits.current = []
    void reload()
    // Retour du réseau : l'avancée en attente part, puis le projet est relu.
    const online = () => void reload()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [id, reload])

  const saveStep = useCallback(
    async (stepId: string, progress: StepProgress) => {
      const before = latest.current
      if (!before) return false
      const previous = before.steps.find((s) => s.id === stepId)
      if (!previous) return false
      edit(stepId, progress)
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
        const saved = queue.current.then(async () => {
          const queuedAtSend = new Map(pendingFor(before.id)).get(stepId)
          await api.knitting.saveProgress(stepId, progress)
          settleProgress(stepId, progress, queuedAtSend)
        })
        queue.current = saved.catch(() => undefined)
        await saved
        setPending(pendingFor(before.id).length)
        setOffline(false)
        return true
      } catch (error) {
        if (isOffline() || isNetworkError(error)) return keep()
        // Rétablit seulement les champs envoyés (une autre modification a pu suivre).
        const restored = Object.fromEntries(Object.keys(progress).map((key) => [key, previous[key as keyof StepProgress]])) as StepProgress
        edit(stepId, restored)
        const current = latest.current
        if (current) apply({ ...current, steps: current.steps.map((s) => (s.id === stepId ? { ...s, ...restored } : s)) })
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

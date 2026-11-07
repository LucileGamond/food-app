import { ArrowLeft, Camera, Flashlight, Pause, Play, Plus, RotateCcw, Square, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiContext'
import { PageHeader } from '@/components/PageHeader'
import { BatchResults, type BatchResultItem } from '@/components/recipes/BatchResults'
import { SourceInput } from '@/components/recipes/SourceInput'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useWakeLock } from '@/hooks/useWakeLock'
import { BATCH_CONCURRENCY, mergeRetry, type BatchResult } from '@/lib/batchImport'
import {
  addCapture,
  allRead,
  closeAll,
  MAX_SCAN_PAGES,
  newSession,
  nextReadyAt,
  OFFLINE_RETRY_MS,
  readyToRead,
  resumeSession,
  retryErrors,
  scanCounts,
  startNewRecipe,
  undoLast,
  updateGroup,
  type ScanGroup,
  type ScanSession,
} from '@/lib/bookScan'
import { createShutterFeedback, openCamera, type CameraSession } from '@/lib/camera'
import { initialScanState, nextScanState, registerCapture, samePageInView, type ScanHint, type ScanStep } from '@/lib/pageScan'
import { scanStore } from '@/lib/scanStore'
import { findSource, recipeKey } from '@/lib/sources'
import { cn } from '@/lib/utils'
import { applyAutoLinks } from '@/services/autoLinks'
import { importPages } from '@/services/batchImport'

type Phase = 'loading' | 'setup' | 'camera' | 'review'

/** Images analysées par seconde. */
const ANALYSIS_INTERVAL_MS = 125

const HINTS: Record<ScanHint, string> = {
  moving: 'Tiens le téléphone immobile au-dessus de la page',
  'same-page': 'Page prise : tourne la page',
  blurry: 'Mise au point…',
  steadying: 'Ne bouge plus…',
  ready: 'Photo…',
}

const newId = () => crypto.randomUUID()

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Ligne de résultat d'un groupe de photos. */
function resultItem(group: ScanGroup, index: number, multi: boolean): BatchResultItem {
  const label = multi
    ? `Recette ${index + 1} · ${plural(group.images.length, 'page')}`
    : `Photo ${index + 1}${group.images.length > 1 ? ' · double page' : ''}`
  return { key: group.id, label, status: group.status, message: group.closed ? group.message : 'Prends les pages suivantes', recipes: group.recipes }
}

interface CameraProps {
  multi: boolean
  full: boolean
  feedback: () => void
  onCapture: (pages: Blob[]) => Promise<void>
  onNewRecipe: (keepLastPage: boolean) => void
  onUndo: () => Promise<boolean>
  onFinish: () => void
  children: React.ReactNode
}

/** Caméra ouverte : photo automatique quand la page est nette, immobile et nouvelle ; boutons de la prise. */
function ScanCamera({ multi, full, feedback, onCapture, onNewRecipe, onUndo, onFinish, children }: CameraProps) {
  const video = useRef<HTMLVideoElement>(null)
  const camera = useRef<CameraSession | null>(null)
  const scan = useRef(initialScanState())
  const busy = useRef(false)
  const props = useRef({ onCapture, feedback, full })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hint, setHint] = useState<ScanHint>('moving')
  const [double, setDouble] = useState(false)
  const [flash, setFlash] = useState(false)
  const [torch, setTorch] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [metrics, setMetrics] = useState<ScanStep['metrics'] | null>(null)
  const [debug] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  useWakeLock()

  useEffect(() => {
    props.current = { onCapture, feedback, full }
  })

  useEffect(() => {
    let stopped = false
    openCamera(video.current!).then(
      (session) => {
        if (stopped) return session.stop()
        camera.current = session
        setHasTorch(session.hasTorch)
        setReady(true)
      },
      () => setFailed(true),
    )
    return () => {
      stopped = true
      camera.current?.stop()
      camera.current = null
    }
  }, [])

  async function shoot(manual: boolean) {
    const session = camera.current
    if (!session || busy.current || props.current.full) return
    busy.current = true
    try {
      if (manual) scan.current = registerCapture(scan.current, session.analysisFrame(), performance.now())
      const pages = await session.capture()
      await props.current.onCapture(pages)
      props.current.feedback()
      setFlash(true)
      setTimeout(() => setFlash(false), 150)
    } catch {
      toast.error('La photo a échoué : réessaie.')
    } finally {
      busy.current = false
    }
  }
  const shootRef = useRef(shoot)
  useEffect(() => {
    shootRef.current = shoot
  })

  // Analyse de l'image ~8 fois par seconde : la photo part toute seule quand la page est prête.
  useEffect(() => {
    if (!ready || paused || full) return
    const timer = setInterval(() => {
      const session = camera.current
      if (!session || busy.current) return
      const frame = session.analysisFrame()
      if (!frame) return
      const step = nextScanState(scan.current, frame, performance.now())
      scan.current = step.state
      setHint(step.hint)
      setDouble(session.isDoublePage())
      if (debug) setMetrics(step.metrics)
      if (step.capture) void shootRef.current(false)
    }, ANALYSIS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ready, paused, full, debug])

  async function undo() {
    if (!(await onUndo())) toast.error('Trop tard : cette photo est déjà en lecture.')
  }

  function toggleTorch() {
    const on = !torch
    setTorch(on)
    void camera.current?.setTorch(on)
  }

  const status = failed
    ? 'Caméra inaccessible : autorise l’appareil photo pour cette application dans les réglages du navigateur.'
    : full
      ? `${MAX_SCAN_PAGES} pages : c’est le maximum pour une session. Termine pour lire les dernières recettes.`
      : !ready
        ? 'Ouverture de la caméra…'
        : paused
          ? 'En pause : la photo automatique est arrêtée.'
          : HINTS[hint]

  return (
    <section className="mx-auto max-w-2xl space-y-3" aria-label="Scan en cours">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} className="max-h-[50svh] w-full object-contain" muted playsInline aria-label="Aperçu de la caméra" />
        {double && <div className="pointer-events-none absolute inset-y-4 left-1/2 border-l-2 border-dashed border-white/70" aria-hidden />}
        <div className={cn('pointer-events-none absolute inset-0 bg-white transition-opacity duration-150', flash ? 'opacity-80' : 'opacity-0')} aria-hidden />
        {debug && metrics && (
          <p className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white">
            net {metrics.sharpness.toFixed(0)} · mvt {metrics.motion.toFixed(1)} · dist {Number.isFinite(metrics.distance) ? metrics.distance.toFixed(2) : '–'}
          </p>
        )}
      </div>
      <p role="status" className={cn('text-center text-sm font-medium', failed && 'text-destructive')}>
        {status}
      </p>
      {multi && (
        <Button className="h-14 w-full text-base" onClick={() => onNewRecipe(samePageInView(scan.current))} disabled={failed}>
          <Plus /> Nouvelle recette
        </Button>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" className="h-10 px-3" onClick={() => setPaused((p) => !p)} disabled={!ready || full}>
          {paused ? <Play /> : <Pause />} {paused ? 'Reprendre' : 'Pause'}
        </Button>
        <Button variant="outline" className="h-10 px-3" onClick={() => void shoot(true)} disabled={!ready || full}>
          <Camera /> Prendre la photo
        </Button>
        <Button variant="outline" className="h-10 px-3" onClick={() => void undo()}>
          <Undo2 /> Annuler la dernière
        </Button>
        {hasTorch && (
          <Button variant="outline" className="h-10 px-3" aria-pressed={torch} onClick={toggleTorch}>
            <Flashlight /> Lampe
          </Button>
        )}
        <Button className="h-10 px-3" onClick={onFinish}>
          <Square /> Terminer
        </Button>
      </div>
      {children}
    </section>
  )
}

/** Scan d'un livre entier : l'appareil photo reste ouvert, une photo est prise à chaque page, lue au fil de l'eau. */
export function BookScanPage() {
  const api = useApi()
  const store = scanStore()
  const [phase, setPhase] = useState<Phase>('loading')
  const [saved, setSaved] = useState<ScanSession | null>(null)
  const [session, setSession] = useState<ScanSession | null>(null)
  const [book, setBook] = useState('')
  const [multi, setMulti] = useState(false)
  const [sources, setSources] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [tick, setTick] = useState(0)
  const [lastPhoto, setLastPhoto] = useState<string | null>(null)
  const [linksMade, setLinksMade] = useState(0)
  const known = useRef(new Map<string, string>())
  const tags = useRef<string[]>([])
  const started = useRef(new Set<string>())
  const linked = useRef(false)
  const feedback = useRef<() => void>(() => undefined)
  const current = useRef<ScanSession | null>(null)

  useEffect(() => {
    current.current = session
  }, [session])

  useEffect(() => {
    api.recipes.listSources().then(setSources, () => setSources([]))
    store.load().then(
      (found) => {
        setSaved(found && found.history.length > 0 ? resumeSession(found) : null)
        setPhase('setup')
      },
      () => setPhase('setup'),
    )
  }, [api, store])

  // La session est gardée sur le téléphone à chaque changement : rien n'est perdu si l'application se ferme.
  useEffect(() => {
    if (session) void store.save(session).catch(() => undefined)
  }, [session, store])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => () => void (lastPhoto && URL.revokeObjectURL(lastPhoto)), [lastPhoto])

  /** Recettes déjà enregistrées (doublons sautés) et tags existants (réutilisés par le modèle). */
  async function prepare() {
    const [summaries, existingTags] = await Promise.all([api.recipes.listSavedSummaries().catch(() => []), api.recipes.listTags().catch(() => [] as string[])])
    known.current = new Map(summaries.map((r) => [recipeKey(r.title, r.source), r.id]))
    tags.current = existingTags
    setReady(true)
  }

  async function readGroup(group: ScanGroup) {
    const patch = (p: Partial<ScanGroup>) => setSession((s) => s && updateGroup(s, group.id, p))
    patch({ status: 'reading', message: undefined })
    try {
      const pages = await Promise.all(group.images.map((id) => store.getImage(id).catch(() => undefined)))
      if (pages.some((p) => !p)) return patch({ status: 'error', message: 'Photo introuvable sur le téléphone : reprends-la.' })
      const result: BatchResult = await importPages(pages as Blob[], { api, book: current.current?.book ?? '', tags: tags.current, known: known.current })
      if (result.status === 'error' && !navigator.onLine) {
        return patch({ status: 'pending', readyAt: Date.now() + OFFLINE_RETRY_MS, message: 'Hors ligne : nouvel essai au retour du réseau' })
      }
      patch({ message: undefined, ...mergeRetry(group.recipes, result) })
    } finally {
      started.current.delete(group.id)
    }
  }

  // File de lecture : 2 recettes à la fois, pendant la prise, dès que le délai d'annulation est passé.
  useEffect(() => {
    if (!session || !ready || !online) return
    const now = Date.now()
    const reading = session.groups.filter((g) => g.status === 'reading').length
    for (const group of readyToRead(session, now, BATCH_CONCURRENCY - reading)) {
      if (started.current.has(group.id)) continue
      started.current.add(group.id)
      void readGroup(group)
    }
    const at = nextReadyAt(session, now)
    if (at === null) return
    const timer = setTimeout(() => setTick((t) => t + 1), at - now)
    return () => clearTimeout(timer)
    // readGroup lit la session à jour (current) : seule la file la relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ready, online, tick])

  // Tout est lu : recettes du livre liées entre elles (renvois « voir p. 208 »).
  const finished = phase === 'review' && session !== null && allRead(session)
  useEffect(() => {
    if (!finished || linked.current) return
    linked.current = true
    applyAutoLinks(api).then((auto) => setLinksMade((n) => n + auto.linked.length), () => undefined)
  }, [finished, api])

  async function start() {
    setSubmitted(true)
    if (!book.trim()) return
    feedback.current = createShutterFeedback()
    await store.clear().catch(() => undefined)
    started.current.clear()
    linked.current = false
    setSession(newSession(findSource(book, sources) ?? book.trim(), multi))
    setPhase('camera')
    await prepare()
  }

  async function resume() {
    if (!saved) return
    feedback.current = createShutterFeedback()
    setSession(saved)
    setSaved(null)
    setPhase(scanCounts(saved).pages >= MAX_SCAN_PAGES ? 'review' : 'camera')
    await prepare()
  }

  async function abandon() {
    await store.clear().catch(() => undefined)
    setSaved(null)
  }

  async function capture(pages: Blob[]) {
    const ids = pages.map(() => newId())
    await Promise.all(ids.map((id, i) => store.putImage(id, pages[i]!)))
    setSession((s) => s && addCapture(s, ids, Date.now(), newId))
    setLastPhoto(URL.createObjectURL(pages[0]!))
  }

  async function undo(): Promise<boolean> {
    const result = current.current && undoLast(current.current)
    if (!result) return false
    setSession(result.session)
    setLastPhoto(null)
    await store.deleteImages(result.removed).catch(() => undefined)
    return true
  }

  function finish() {
    setSession((s) => s && closeAll(s, Date.now()))
    setPhase('review')
  }

  async function newBook() {
    await store.clear().catch(() => undefined)
    setSession(null)
    setBook('')
    setSubmitted(false)
    setLastPhoto(null)
    setLinksMade(0)
    setPhase('setup')
  }

  const counts = session ? scanCounts(session) : null
  const full = (counts?.pages ?? 0) >= MAX_SCAN_PAGES
  const results = session ? <BatchResults label="Recettes scannées" items={session.groups.map((g, i) => resultItem(g, i, session.multi))} /> : null
  const summary = counts
    ? [
        plural(counts.pages, 'page'),
        counts.waiting > 0 && `${counts.waiting} à lire`,
        counts.saved > 0 && `${counts.saved} enregistrée${counts.saved > 1 ? 's' : ''}`,
        counts.duplicate > 0 && `${counts.duplicate} déjà enregistrée${counts.duplicate > 1 ? 's' : ''}`,
        counts.skipped > 0 && `${counts.skipped} sans recette`,
        counts.incomplete > 0 && `${counts.incomplete} à compléter`,
        counts.error > 0 && `${counts.error} en erreur`,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const bookError = submitted && !book.trim() ? 'Indique le livre' : null

  return (
    <>
      <Link to="/recettes/import-serie" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Importer en série
      </Link>
      <PageHeader title="Scanner un livre" description={session ? session.book : 'Tourne les pages devant le téléphone : chaque page est photographiée et lue toute seule.'} />

      {phase === 'setup' && saved && (
        <section className="mx-auto mb-4 max-w-2xl space-y-3 rounded-2xl border bg-background p-5 shadow-xs" aria-label="Scan interrompu">
          <p className="font-medium">Reprendre le scan de « {saved.book} »</p>
          <p className="text-sm text-muted-foreground">
            {plural(scanCounts(saved).pages, 'page')} · {scanCounts(saved).waiting} à lire
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="h-10 px-4" onClick={() => void resume()}>
              <Play /> Reprendre
            </Button>
            <Button variant="outline" className="h-10 px-3" onClick={() => void abandon()}>
              Abandonner
            </Button>
          </div>
        </section>
      )}

      {phase === 'setup' && !saved && (
        <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-background p-5 shadow-xs">
          <div className="space-y-2">
            <Label htmlFor="scan-book">Livre</Label>
            <SourceInput
              id="scan-book"
              value={book}
              sources={sources}
              placeholder="Pâtisserie maison"
              onChange={setBook}
              invalid={Boolean(bookError)}
              className="placeholder:text-muted-foreground/40"
            />
            {bookError && <p className="text-sm text-destructive">{bookError}</p>}
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="scan-multi" checked={multi} onCheckedChange={(c) => setMulti(c === true)} className="mt-0.5 size-5" />
            <div className="space-y-1">
              <Label htmlFor="scan-multi">Recettes sur plusieurs photos</Label>
              <p className="text-xs text-muted-foreground">
                Sinon, chaque photo est une recette. Téléphone en portrait pour une page, en paysage pour une double page.
              </p>
            </div>
          </div>
          <Button className="h-10 px-4" onClick={() => void start()}>
            <Camera /> Ouvrir la caméra
          </Button>
        </section>
      )}

      {phase === 'camera' && session && (
        <ScanCamera
          multi={session.multi}
          full={full}
          feedback={() => feedback.current()}
          onCapture={capture}
          onNewRecipe={(keep) => setSession((s) => s && startNewRecipe(s, Date.now(), newId, keep))}
          onUndo={undo}
          onFinish={finish}
        >
          <div className="flex items-center gap-3">
            {lastPhoto && <img src={lastPhoto} alt="Dernière photo" className="h-16 w-12 shrink-0 rounded border object-cover" />}
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary}
              {!online && ' · hors ligne : la lecture reprendra au retour du réseau'}
            </p>
          </div>
          {results}
        </ScanCamera>
      )}

      {phase === 'review' && session && counts && (
        <section className="mx-auto max-w-2xl space-y-4" aria-labelledby="scan-progress">
          <div className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs">
            <h2 id="scan-progress" className="font-semibold tracking-tight">
              {finished ? 'Scan terminé' : 'Lecture en cours'}
            </h2>
            <p className="text-sm text-muted-foreground">{summary}</p>
            {!online && <p className="text-sm text-muted-foreground">Hors ligne : la lecture reprendra au retour du réseau.</p>}
            {linksMade > 0 && <p className="text-sm text-muted-foreground">{plural(linksMade, 'lien')} entre recettes</p>}
            <div className="flex flex-wrap gap-2">
              {!full && (
                <Button variant="outline" className="h-10 px-3" onClick={() => setPhase('camera')}>
                  <Camera /> Reprendre le scan
                </Button>
              )}
              {counts.error > 0 && (
                <Button variant="outline" className="h-10 px-3" onClick={() => setSession((s) => s && retryErrors(s))}>
                  <RotateCcw /> Réessayer les erreurs
                </Button>
              )}
              <Link to="/recettes" className={cn(buttonVariants(), 'h-10 px-4')}>
                Voir les recettes
              </Link>
              {finished && (
                <Button variant="outline" className="h-10 px-3" onClick={() => void newBook()}>
                  Scanner un autre livre
                </Button>
              )}
            </div>
          </div>
          {results}
        </section>
      )}
    </>
  )
}

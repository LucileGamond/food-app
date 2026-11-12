import { Check, SearchX, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { ScreenAwakeToggle } from '@/components/ScreenAwakeToggle'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useScreenAwake } from '@/hooks/useWakeLock'
import { cn } from '@/lib/utils'
import { ChartFullscreen } from '../components/ChartImage'
import { ModeCounter } from '../components/mode/ModeCounter'
import { PatternDrawer } from '../components/mode/PatternDrawer'
import { RowLine } from '../components/mode/RowLine'
import { StepDone } from '../components/mode/StepDone'
import { OfflineNote } from '../components/OfflineNote'
import { StepReady } from '../components/StepReady'
import { readyIssues } from '../lib/ready'
import { effectiveNeedles, formatNeedle } from '../lib/needles'
import { StepOutline } from '../components/StepOutline'
import { useBaseGlossary } from '../hooks/useBaseGlossary'
import { useKnitProject } from '../hooks/useKnitProject'
import { useRowVibration } from '../hooks/useRowVibration'
import { stepsToFollow, withAdaptedSections, type ShownStep } from '../lib/adapt'
import { chartPosition } from '../lib/chart'
import { looksEnglish, mergeGlossary } from '../lib/glossary'
import { stepGuide } from '../lib/guide'
import { stitchTrack } from '../lib/stitches'
import { describePass, finishPass, hasNextPass, ordinal } from '../lib/passes'
import { currentStepIndex, type KnitProject } from '../lib/pattern'
import { finishSubstep, substepCounts, type SubstepCount } from '../lib/substeps'

/**
 * Mode tricoter : plein écran, écran allumé. Le rang à tricoter (tout ce qu'il demande), ce qui arrive ensuite et le
 * compteur. Le reste du projet (laine, sections, diagrammes…) se prépare sur la page du projet.
 */
export function KnittingModePage() {
  const { id = '' } = useParams()
  return <KnittingMode key={id} id={id} />
}

function KnittingMode({ id }: { id: string }) {
  const api = useApi()
  const knit = useKnitProject(api, id)
  const projectTo = `/tricot/${id}`

  const shell = (children: ReactNode) => (
    <div className="mx-auto min-h-dvh max-w-2xl bg-page px-4 pt-4 pb-[env(safe-area-inset-bottom)]">
      <Link to={projectTo} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'mb-2')} aria-label="Quitter le mode tricoter">
        <X />
      </Link>
      {children}
    </div>
  )

  if (knit.loadError) return shell(<LoadError message={knit.loadError} onRetry={() => void knit.reload()} />)
  if (knit.loading) {
    return shell(
      <div className="space-y-3" aria-busy="true" aria-label="Chargement du projet">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>,
    )
  }
  if (!knit.project || knit.project.steps.length === 0) {
    return shell(<EmptyState icon={SearchX} title={knit.project ? 'Aucune étape à tricoter' : 'Projet introuvable'} description="Il a peut-être été supprimé." />)
  }
  return <Knitting project={knit.project} knit={knit} projectTo={projectTo} />
}

interface KnittingProps {
  project: KnitProject
  knit: ReturnType<typeof useKnitProject>
  projectTo: string
}

function Knitting({ project, knit, projectTo }: KnittingProps) {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const awake = useScreenAwake()
  const base = useBaseGlossary()
  const [finishing, setFinishing] = useState(false)
  const [chartOpen, setChartOpen] = useState<string | null>(null)

  const { size, steps } = stepsToFollow(project)
  const step: ShownStep = steps.find((s) => s.id === params.get('etape')) ?? steps[currentStepIndex(steps)]!
  const index = steps.indexOf(step)
  const next = steps[index + 1] ?? null
  const charts = project.charts.filter((c) => c.stepId === step.id)
  const guide = stepGuide(step, charts, next?.title ?? null)
  const row = step.rowCount + 1
  const finished = step.done || (step.totalRows !== null && step.rowCount >= step.totalRows)
  const line = guide.at(row)
  const glossary = mergeGlossary(project.abbreviations ?? [], base, looksEnglish(step.instructions))
  const setupTo = `${projectTo}?etape=${encodeURIComponent(step.id)}`
  const issues = readyIssues(step, project.needles ?? [])
  const ready = issues.length === 0
  const substeps = finished ? [] : substepCounts(step, row)
  const needles = effectiveNeedles(step.sections, project.needles ?? [])
  const needle = substeps[0] ? (needles[substeps[0].index] ?? null) : null
  // Premier rang d'une sous-étape qui change d'aiguille : le rappeler
  const needleChange = substeps.find((c) => c.row === 1 && c.index > 0 && needles[c.index] !== null && needles[c.index] !== needles[c.index - 1])
  useRowVibration(row, !finished && line.events.length > 0)

  const count = (delta: number) => void knit.countRows(step.id, delta)
  // Étape tricotée plusieurs fois : finir une fois ouvre la suivante (compteur à 0), pas l'étape suivante.
  const anotherPass = !step.done && hasNextPass(step)
  const pass = describePass(step)

  async function finish() {
    const progress = finishPass(step)
    if (!(await knit.saveStep(step.id, progress))) return
    if (progress.done && next) setParams({ etape: next.id }, { replace: true })
  }

  /** Sous-étape finie : sa longueur devient les rangs tricotés (dans l'adaptation pour une étape adaptée). */
  async function finishSub(count: SubstepCount) {
    const sections = finishSubstep(step.sections, count.index, count.row - 1)
    const adaptation = project.adaptation ?? null
    if (!step.adapted || !adaptation) {
      await knit.saveStep(step.id, { sections })
      return
    }
    try {
      await api.knitting.saveAdaptation(project.id, withAdaptedSections(adaptation, step.id, sections))
      await knit.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function translate() {
    try {
      const translated = await api.knitting.translateText(step.instructions)
      if (!translated.numbersKept) toast.warning('Vérifie les nombres : la traduction en a changé certains.')
      await knit.saveStep(step.id, { translation: translated.text })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const openChart = charts.find((c) => c.id === chartOpen)

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-page">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to={projectTo} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'shrink-0')} aria-label="Quitter le mode tricoter">
            <X />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{step.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {[project.title, `étape ${index + 1} sur ${steps.length}`, pass, `taille ${size}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ScreenAwakeToggle awake={awake} compact className="shrink-0" />
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 pt-4 pb-6">
        <OfflineNote offline={knit.offline} pending={knit.pending} />
        {finished ? (
          <StepDone done={step.done} next={next?.title ?? null} passDone={anotherPass ? step.pass : null} projectTo={projectTo} onFinish={() => setFinishing(true)} />
        ) : !ready ? (
          // Pas prête : on la prépare d'abord, rien ne se compte
          <StepReady issues={issues} setupTo={setupTo} />
        ) : (
          <>
            {needleChange && (
              <p role="status" className="rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm font-medium">
                Change pour l’aiguille {formatNeedle(needles[needleChange.index]!)}
              </p>
            )}
            <RowLine line={line} stitches={stitchTrack(step)(row)} glossary={glossary} setupTo={setupTo} onOpenChart={setChartOpen} />
          </>
        )}
        <StepOutline step={step} nextTitle={next?.title ?? null} showCurrent={!finished} upcoming={finished || !ready || line.unknown ? null : (guide.upcoming(row, 1)[0] ?? null)} />
        <PatternDrawer
          step={step}
          row={finished ? null : row}
          size={size}
          sizes={project.sizes}
          sizeIndex={project.sizeIndex}
          abbreviations={project.abbreviations ?? []}
          onHighlights={(highlights) => void knit.saveStep(step.id, { highlights })}
          onTranslate={translate}
          onNotes={(notes) => void knit.saveStep(step.id, { notes })}
        />
        {!finished && ready && (
          <Button variant="outline" className="h-10" onClick={() => setFinishing(true)}>
            <Check /> {anotherPass ? `Terminer la ${ordinal(step.pass)} fois maintenant` : 'Terminer l’étape maintenant'}
          </Button>
        )}
      </main>

      {!step.done && ready && (
        <footer className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <ModeCounter rowCount={step.rowCount} totalRows={step.totalRows} onCount={count} substeps={substeps} needle={needle} onFinishSubstep={(c) => void finishSub(c)} />
        </footer>
      )}

      {openChart && (
        <ChartFullscreen
          chart={openChart}
          position={chartPosition(openChart, row)}
          open
          onOpenChange={(open) => !open && setChartOpen(null)}
          counter={{ rowCount: step.rowCount, onCount: count }}
        />
      )}
      {anotherPass ? (
        <ConfirmDialog
          open={finishing}
          onOpenChange={setFinishing}
          title={`Commencer la ${ordinal(step.pass + 1)} fois ?`}
          description={`La ${ordinal(step.pass)} fois de « ${step.title} » est finie : le compteur repart au rang 1 pour la ${ordinal(step.pass + 1)} fois sur ${step.times}.`}
          confirmLabel={`Commencer la ${ordinal(step.pass + 1)} fois`}
          onConfirm={finish}
        />
      ) : (
        <ConfirmDialog
          open={finishing}
          onOpenChange={setFinishing}
          title={next ? 'Passer à l’étape suivante ?' : 'Terminer le projet ?'}
          description={next ? `« ${step.title} » sera marquée terminée, et « ${next.title} » s’ouvrira au rang ${next.rowCount + 1}.` : `« ${step.title} » est la dernière étape.`}
          confirmLabel={next ? 'Étape terminée' : 'Projet terminé'}
          onConfirm={finish}
        />
      )}
    </div>
  )
}

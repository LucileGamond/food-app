import { Check, ChevronLeft, ChevronRight, FileText, ListTree, MoreHorizontal, Play, SearchX, Trash2, Undo2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/LoadError'
import { cn } from '@/lib/utils'
import { openInNewTab } from '@/lib/openInNewTab'
import { SizePicker, StepText } from '../components/SizedText'
import { YarnCheckCard } from '../components/YarnCheckCard'
import { withoutYarn, withYarnCheck, type YarnCheck } from '../lib/yarnLeft'
import { StepCharts } from '../components/StepCharts'
import { StepSections } from '../components/StepSections'
import { ProgressPanel } from '../components/ProgressPanel'
import { AdaptPanel } from '../components/AdaptPanel'
import { stepsToFollow, withAdaptedSections, type ShownStep } from '../lib/adapt'
import { YarnPanel, type ProjectInfo } from '../components/YarnPanel'
import { adjustCount } from '../lib/yarn'
import { useKnitProject } from '../hooks/useKnitProject'
import { forgetProject } from '../lib/offline'
import { currentStepIndex, stepFacts, type StepSection } from '../lib/pattern'
import { OfflineNote } from '../components/OfflineNote'
import { StepNotes } from '../components/StepNotes'
import { StepTimes } from '../components/StepTimes'
import { StepOutline } from '../components/StepOutline'
import { StepReady } from '../components/StepReady'
import { ProjectNeedles } from '../components/ProjectNeedles'
import { isReady, readyIssues } from '../lib/ready'
import { describePass } from '../lib/passes'

export function KnittingProjectPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const { project, loading, loadError, reload, saveStep, offline, pending } = useKnitProject(api, id)
  const [params, setParams] = useSearchParams()
  // Préparation d'une étape (?etape=<id>, vide : l'étape en cours) ; sans paramètre, la vue du projet (liste des étapes).
  // On tricote dans le mode tricoter (/tricot/:id/tricoter) ; ici, on prépare : texte, sections, diagrammes.
  const stepParam = params.get('etape')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const back = (
    <Link to="/tricot" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden /> Projets
    </Link>
  )

  if (loadError) {
    return (
      <>
        {back}
        <LoadError message={loadError} onRetry={() => void reload()} />
      </>
    )
  }
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement du projet">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }
  if (!project) {
    return (
      <EmptyState
        icon={SearchX}
        title="Projet introuvable"
        description="Il a peut-être été supprimé."
        action={
          <Link to="/tricot" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            Retour aux projets
          </Link>
        }
      />
    )
  }

  // Patron adapté suivi : ses rangs, mailles et sections remplacent ceux du patron d'origine (gardé tel quel).
  const adaptation = project.adaptation ?? null
  const needles = project.needles ?? []
  const { size: followedSize, steps, following } = stepsToFollow(project)
  const knitTo = (stepId?: string) => `/tricot/${project.id}/tricoter${stepId ? `?etape=${encodeURIComponent(stepId)}` : ''}`
  const current = steps[currentStepIndex(steps)]
  const step = steps.find((s) => s.id === stepParam) ?? current
  const index = step ? steps.indexOf(step) : -1
  /** Ouvre une étape ; d'une étape à l'autre, le retour ramène quand même à la liste. */
  const openStep = (stepId: string, replace = false) => setParams({ etape: stepId }, { replace })

  async function openPdf() {
    await openInNewTab(() => api.knitting.pdfUrl(project!.pdfPath!)).catch((error: unknown) => toast.error(errorMessage(error)))
  }

  // L'estimation (≈) d'après l'échantillon n'a plus lieu d'être quand le patron adapté est suivi.
  const noGauge = { stitches: null, rows: null }
  const gauges = following ? { pattern: noGauge, mine: noGauge } : { pattern: project.patternGauge, mine: project.myGauge }

  async function saveInfo(info: ProjectInfo, removedYarn?: number): Promise<boolean> {
    try {
      await api.knitting.saveProjectInfo(project!.id, info)
      // Laine retirée : les pesées restent liées à la bonne laine.
      const checks = project!.yarnChecks ?? []
      if (removedYarn !== undefined && checks.some((c) => c.yarn >= removedYarn)) await api.knitting.saveYarnChecks(project!.id, withoutYarn(checks, removedYarn))
      await reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  /** Texte de l'étape (patron en anglais) traduit en français, gardé avec l'étape. */
  async function translateStep(stepId: string, text: string) {
    try {
      const translated = await api.knitting.translateText(text)
      if (!translated.numbersKept) toast.warning('Vérifie les nombres : la traduction en a changé certains.')
      await saveStep(stepId, { translation: translated.text })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function saveYarnCheck(check: YarnCheck): Promise<boolean> {
    try {
      await api.knitting.saveYarnChecks(project!.id, withYarnCheck(project!.yarnChecks ?? [], check))
      await reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  /** Sections modifiées : dans l'adaptation pour une étape adaptée, sinon dans l'étape du patron. */
  async function saveSections(target: ShownStep, sections: StepSection[]): Promise<boolean> {
    if (!target.adapted || !adaptation) return saveStep(target.id, { sections })
    try {
      await api.knitting.saveAdaptation(project!.id, withAdaptedSections(adaptation, target.id, sections))
      await reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function saveNeedles(next: number[]): Promise<boolean> {
    try {
      await api.knitting.saveNeedles(project!.id, next)
      await reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function changeSize(sizeIndex: number | null) {
    try {
      await api.knitting.setSizeIndex(project!.id, sizeIndex)
      await reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function remove() {
    try {
      await api.knitting.deleteProject(project!)
      // Plus de copie sur le téléphone ni d'avancée en attente pour ce projet.
      forgetProject(project!.id)
      toast.success('Projet supprimé')
      navigate('/tricot')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const offlineNote = (
    <div className="mb-3 empty:hidden">
      <OfflineNote offline={offline} pending={pending} />
    </div>
  )

  if (stepParam !== null && step) {
    const adjustedStitches = adjustCount(step.stitches, gauges.pattern.stitches, gauges.mine.stitches)
    const adjustedRows = adjustCount(step.totalRows, gauges.pattern.rows, gauges.mine.rows)
    return (
      <>
        <Link to={`/tricot/${project.id}`} className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4 shrink-0" aria-hidden /> <span className="truncate">{project.title}</span>
        </Link>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {step.done || isReady(step, needles) ? (
            <Link to={knitTo(step.id)} className={cn(buttonVariants(), 'h-10')}>
              <Play /> Tricoter cette étape
            </Link>
          ) : (
            <Button className="h-10" disabled aria-describedby="step-ready-title">
              <Play /> Tricoter cette étape
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="icon-lg" aria-label="Étape précédente" disabled={index === 0} onClick={() => openStep(steps[index - 1]!.id, true)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-lg" aria-label="Étape suivante" disabled={index === steps.length - 1} onClick={() => openStep(steps[index + 1]!.id, true)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        {offlineNote}

        <article key={step.id} aria-labelledby="step-title" className="space-y-4 rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
          <header>
            <p className="text-xs text-muted-foreground">
              {[`Étape ${index + 1} sur ${steps.length}`, ...stepFacts(step)].join(' · ')}
              {adjustedStitches !== null && ` (≈ ${adjustedStitches} avec ton échantillon)`}
            </p>
            <h1 id="step-title" className="text-xl font-semibold tracking-tight">
              {step.title}
            </h1>
            {!step.done && (
              <div className="mt-2">
                <StepReady issues={readyIssues(step, needles)} />
              </div>
            )}
            {step.adapted && (
              <p className="mt-1 flex items-start gap-1.5 rounded-xl bg-brand/10 p-2 text-sm">
                <Wand2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  Patron adapté{step.adapted.note && ` : ${step.adapted.note}`}
                  <span className="block text-xs text-muted-foreground">
                    Patron d’origine : {step.adapted.original.totalRows ?? '?'} rangs, {step.adapted.original.stitches ?? '?'} mailles à la fin.
                  </span>
                </span>
              </p>
            )}
          </header>
          {step.instructions && (
            <StepText
              text={step.instructions}
              sizes={project.sizes}
              sizeIndex={project.sizeIndex}
              highlights={step.highlights}
              onChange={(highlights) => void saveStep(step.id, { highlights })}
              abbreviations={project.abbreviations ?? []}
              translation={step.translation ?? null}
              onTranslate={() => translateStep(step.id, step.instructions)}
            />
          )}
          <p className="text-sm text-muted-foreground">
            {step.rowCount} rang{step.rowCount > 1 ? 's' : ''} fait{step.rowCount > 1 ? 's' : ''}
            {step.totalRows !== null && ` sur ${step.totalRows}`}
            {adjustedRows !== null && ` (≈ ${adjustedRows} rangs avec ton échantillon)`}
            {describePass(step) && ` · ${describePass(step)}`}
          </p>
          <StepTimes step={step} onChange={(progress) => void saveStep(step.id, progress)} />
          <StepSections step={step} needles={needles} onChange={(sections) => saveSections(step, sections)} />
          <StepOutline step={step} nextTitle={steps[index + 1]?.title ?? null} showCurrent={!step.done && step.rowCount > 0} />
          <StepCharts projectId={project.id} pdfPath={project.pdfPath} step={step} steps={steps} charts={project.charts} hints={project.chartHints} onChanged={reload} />
          <StepNotes key={step.id} step={step} onSave={(notes) => void saveStep(step.id, { notes })} />
          {step.done && (
            <Button variant="outline" className="h-10" onClick={() => void saveStep(step.id, { done: false })}>
              <Undo2 /> Reprendre l’étape
            </Button>
          )}
        </article>
      </>
    )
  }

  return (
    <>
      {back}
      <PageHeader
        title={project.title}
        description={`Taille ${project.size} · ${steps.filter((s) => s.done).length} / ${steps.length} étapes`}
        actions={
          <>
            {project.pdfPath && (
              <Button variant="outline" className="h-10" onClick={() => void openPdf()}>
                <FileText /> Voir le PDF
              </Button>
            )}
            {current && !current.done && (
              <Link to={knitTo()} className={cn(buttonVariants(), 'h-10')}>
                <Play /> Tricoter
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Actions sur le projet" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Supprimer le projet
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {offlineNote}
      <div className="mb-4 space-y-2">
        <SizePicker id="knit-size-index" sizes={project.sizes} sizeIndex={project.sizeIndex} onChange={(i) => void changeSize(i)} />
        <ProjectNeedles needles={needles} onSave={saveNeedles} />
      </div>

      <nav aria-labelledby="knit-steps">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="knit-steps" className="text-lg font-semibold tracking-tight">
            Étapes
          </h2>
          {steps.length > 1 && (
            <Link to={`/tricot/${project.id}/organiser`} className={cn(buttonVariants({ variant: 'ghost' }), 'h-9')}>
              <ListTree /> Organiser
            </Link>
          )}
        </div>
        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune étape dans ce patron.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => {
              const isCurrent = s.id === current?.id && !s.done
              return (
                <li key={s.id}>
                  <Link
                    to={`?etape=${encodeURIComponent(s.id)}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      isCurrent ? 'border-brand bg-brand/5' : 'bg-background hover:bg-muted/50',
                    )}
                  >
                    <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs', s.done ? 'bg-brand text-white' : 'bg-muted')} aria-hidden>
                      {s.done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', isCurrent && 'font-medium')}>{s.title}</span>
                      {(s.rowCount > 0 || s.totalRows !== null || s.times > 1) && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {s.rowCount}
                          {s.totalRows !== null && ` / ${s.totalRows}`} rangs
                          {describePass(s) && ` · ${describePass(s)}`}
                        </span>
                      )}
                    </span>
                    {s.done && <span className="sr-only">(terminée)</span>}
                    {!s.done && !isReady(s, needles) && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium">À préparer</span>}
                    {isCurrent && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium">En cours</span>}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </nav>

      <div className="mt-6 space-y-4">
        <YarnPanel info={{ yarns: project.yarns, patternGauge: project.patternGauge, myGauge: project.myGauge }} onSave={saveInfo} />
        <AdaptPanel project={project} size={followedSize} onSaved={reload} />
        <YarnCheckCard yarns={project.yarns} steps={steps} checks={project.yarnChecks ?? []} onSave={saveYarnCheck} />
        <ProgressPanel projectId={project.id} currentStepId={current?.id ?? null} stepTitle={(id) => steps.find((s) => s.id === id)?.title} />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer le projet ?"
        description="Les étapes, rangs comptés, notes et le PDF seront supprimés."
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </>
  )
}

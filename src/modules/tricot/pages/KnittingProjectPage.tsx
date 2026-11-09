import { ArrowRight, BellRing, Check, SearchX, ChevronLeft, ChevronRight, CloudOff, FileText, Minus, MoreHorizontal, Plus, Trash2, Undo2, Wand2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { LoadError } from '@/components/LoadError'
import { useScreenAwake } from '@/hooks/useWakeLock'
import { ScreenAwakeToggle } from '@/components/ScreenAwakeToggle'
import { cn } from '@/lib/utils'
import { openInNewTab } from '@/lib/openInNewTab'
import { SizePicker, StepText } from '../components/SizedText'
import { StepQuestion } from '../components/StepQuestion'
import { StepAbbreviations } from '../components/StepAbbreviations'
import { YarnCheckCard } from '../components/YarnCheckCard'
import { withoutYarn, withYarnCheck, type YarnCheck } from '../lib/yarnLeft'
import { StepCharts } from '../components/StepCharts'
import { StepSections } from '../components/StepSections'
import { ProgressPanel } from '../components/ProgressPanel'
import { AdaptPanel } from '../components/AdaptPanel'
import { adaptationPaused, applyAdaptation, withAdaptedSections, type ShownStep } from '../lib/adapt'
import { YarnPanel, type ProjectInfo } from '../components/YarnPanel'
import { adjustCount, type Gauge } from '../lib/yarn'
import { useKnitProject } from '../hooks/useKnitProject'
import { forgetProject } from '../lib/offline'
import { alertsAt, currentStepIndex, describeSection, MAX_ROW_COUNT, type KnitStep, type StepSection } from '../lib/pattern'

function RowCounter({ step, gauges, onCount }: { step: KnitStep; gauges: { pattern: Gauge; mine: Gauge }; onCount: (delta: number) => void }) {
  const adjustedRows = adjustCount(step.totalRows, gauges.pattern.rows, gauges.mine.rows)
  // Le compteur compte les rangs terminés : on annonce ce qu'il y a à faire sur le rang à tricoter.
  const row = step.rowCount + 1
  const finished = step.totalRows !== null && step.rowCount >= step.totalRows
  const alerts = finished ? [] : alertsAt(step, row)
  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground" id={`rows-${step.id}`}>
        Rangs terminés
      </p>
      <div className="mt-1 flex items-center gap-3">
        <Button variant="outline" size="icon-lg" aria-label="Retirer un rang" disabled={step.rowCount === 0} onClick={() => onCount(-1)}>
          <Minus />
        </Button>
        <p className="min-w-0 flex-1 text-center" aria-labelledby={`rows-${step.id}`}>
          <span className="text-4xl font-semibold tabular-nums">{step.rowCount}</span>
          {step.totalRows && <span className="text-muted-foreground"> / {step.totalRows}</span>}
          {adjustedRows !== null && <span className="block text-xs text-muted-foreground">≈ {adjustedRows} rangs avec ton échantillon</span>}
        </p>
        <Button className="h-12 px-5" disabled={step.rowCount >= MAX_ROW_COUNT} onClick={() => onCount(1)}>
          <Plus />
          <span className="sr-only">Ajouter</span> 1 rang
        </Button>
      </div>
      {/* Annoncé au lecteur d'écran à chaque rang compté. */}
      <div aria-live="polite">
        {finished ? (
          !step.done && (
            <p role="status" className="mt-3 text-sm font-medium">
              Tous les rangs de l’étape sont faits.
            </p>
          )
        ) : (
          <div role="status" className={cn('mt-3 rounded-xl p-3 text-sm', alerts.length ? 'bg-brand/10' : 'bg-background')}>
            <p className="font-medium">Rang {row} à tricoter</p>
            {alerts.map((a, i) =>
              a.type === 'action' ? (
                <p key={i} className="mt-1 flex items-start gap-2 font-medium">
                  <BellRing className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {a.action.text}
                  {a.times !== null && ` (${a.count}/${a.times})`}
                </p>
              ) : (
                <p key={i} className="mt-1 flex items-start gap-2">
                  <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Nouvelle section : {describeSection(a.section)}
                </p>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Notes({ step, onSave }: { step: KnitStep; onSave: (notes: string) => void }) {
  const [value, setValue] = useState(step.notes)
  const id = `notes-${step.id}`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Notes</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={5000}
        placeholder="Aiguilles, essais, modifications…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== step.notes && onSave(value)}
      />
    </div>
  )
}

export function KnittingProjectPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const { project, loading, loadError, reload, saveStep, countRows, offline, pending } = useKnitProject(api, id)
  const [params, setParams] = useSearchParams()
  // Vue d'une étape (?etape=<id>, vide : l'étape en cours) ; sans paramètre, la vue du projet (liste des étapes).
  const stepParam = params.get('etape')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Aiguilles en main : l'écran ne s'éteint pas tant qu'une étape est affichée (sauf si on l'a éteint).
  const awake = useScreenAwake(stepParam !== null)

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
  const followedSize = (project.sizeIndex !== null ? project.sizes[project.sizeIndex] : undefined) ?? project.size
  const following = adaptation?.active === true && !adaptationPaused(adaptation, followedSize)
  const steps: ShownStep[] = applyAdaptation(project.steps, adaptation, followedSize)
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

  async function changeSize(sizeIndex: number | null) {
    try {
      await api.knitting.setSizeIndex(project!.id, sizeIndex)
      await reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function finishStep(target: ShownStep) {
    const next = steps[steps.indexOf(target) + 1]
    if ((await saveStep(target.id, { done: true })) && next) openStep(next.id, true)
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

  const offlineNote = (offline || pending > 0) && (
    <p role="status" className="mb-3 flex items-start gap-1.5 rounded-xl bg-muted/50 p-3 text-sm">
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {offline
        ? 'Hors ligne : tu tricotes sur la version gardée sur ce téléphone. Ton avancée sera envoyée au retour du réseau.'
        : 'Avancée en attente d’envoi : elle partira dès que possible.'}
    </p>
  )

  if (stepParam !== null && step) {
    const adjustedStitches = adjustCount(step.stitches, gauges.pattern.stitches, gauges.mine.stitches)
    return (
      <>
        <Link to={`/tricot/${project.id}`} className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4 shrink-0" aria-hidden /> <span className="truncate">{project.title}</span>
        </Link>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <ScreenAwakeToggle awake={awake} />
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
              Étape {index + 1} sur {steps.length}
              {step.stitches && ` · ${step.stitches} mailles à la fin`}
              {adjustedStitches !== null && ` (≈ ${adjustedStitches} avec ton échantillon)`}
            </p>
            <h1 id="step-title" className="text-xl font-semibold tracking-tight">
              {step.title}
            </h1>
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
          <SizePicker id="knit-size-index" sizes={project.sizes} sizeIndex={project.sizeIndex} onChange={(i) => void changeSize(i)} />
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
          {step.instructions && <StepAbbreviations text={step.instructions} translation={step.translation ?? null} abbreviations={project.abbreviations ?? []} />}
          {step.instructions && (
            <StepQuestion
              key={step.id}
              stepTitle={step.title}
              text={step.translation || step.instructions}
              row={step.totalRows !== null && step.rowCount >= step.totalRows ? null : step.rowCount + 1}
              size={followedSize}
              abbreviations={project.abbreviations ?? []}
            />
          )}
          <RowCounter step={step} gauges={gauges} onCount={(delta) => void countRows(step.id, delta)} />
          <StepCharts projectId={project.id} pdfPath={project.pdfPath} step={step} steps={steps} charts={project.charts} hints={project.chartHints} onCount={(delta) => void countRows(step.id, delta)} onChanged={reload} />
          <StepSections step={step} onChange={(sections) => saveSections(step, sections)} onCount={(delta) => void countRows(step.id, delta)} />
          <Notes step={step} onSave={(notes) => void saveStep(step.id, { notes })} />
          <div className="flex flex-wrap gap-2">
            {step.done ? (
              <Button variant="outline" className="h-10" onClick={() => void saveStep(step.id, { done: false })}>
                <Undo2 /> Reprendre l’étape
              </Button>
            ) : (
              <Button className="h-10" onClick={() => void finishStep(step)}>
                <Check /> Étape terminée
              </Button>
            )}
          </div>
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

      <nav aria-labelledby="knit-steps">
        <h2 id="knit-steps" className="mb-2 text-lg font-semibold tracking-tight">
          Étapes
        </h2>
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
                      {(s.rowCount > 0 || s.totalRows !== null) && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {s.rowCount}
                          {s.totalRows !== null && ` / ${s.totalRows}`} rangs
                        </span>
                      )}
                    </span>
                    {s.done && <span className="sr-only">(terminée)</span>}
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

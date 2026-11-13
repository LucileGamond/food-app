import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, ListChecks, ListTree, MoreHorizontal, Play, SearchX, Trash2, Undo2, Wand2 } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { currentStepIndex, newSectionId, stepFacts, type StepSection } from '../lib/pattern'
import { placeCharts } from '../lib/chartPlace'
import { OfflineNote } from '../components/OfflineNote'
import { Fold } from '../components/Fold'
import { StepNotes } from '../components/StepNotes'
import { StepTimes } from '../components/StepTimes'
import { StepReady } from '../components/StepReady'
import { StepStartStitches } from '../components/StepStartStitches'
import { endStitches, startStitchesOf } from '../lib/stitches'
import { ProjectNeedles } from '../components/ProjectNeedles'
import { withChecked, withGauges, type NeedleGauge } from '../lib/needleGauges'
import { isReady, readyIssues } from '../lib/ready'
import { describePass } from '../lib/passes'
import { defaultTab, isProjectTab, startIssues, stepsToPrepare, type ProjectTab } from '../lib/phases'
import { CurrentStepCard } from '../components/CurrentStepCard'
import { OrganizeSteps } from '../components/OrganizeSteps'

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
  // Sous-étape à ouvrir, demandée depuis « À préparer ».
  const [fixSection, setFixSection] = useState<number | null>(null)

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
  const needleGauges = project.needleGauges ?? []
  const { size: followedSize, steps, following } = stepsToFollow(project)
  // Diagrammes rattachés à une sous-étape : placés sur ses rangs d'aujourd'hui
  const charts = placeCharts(project.charts, steps)
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

  /** Échantillons par aiguille : une aiguille dont l'échantillon change est à revérifier. */
  async function saveNeedleGauges(next: NeedleGauge[]): Promise<boolean> {
    try {
      await api.knitting.saveNeedleGauges(project!.id, withGauges(needleGauges, next, false))
      await reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function saveInfo(info: ProjectInfo, removedYarn?: number): Promise<boolean> {
    try {
      await api.knitting.saveProjectInfo(project!.id, info)
      // Échantillon général (ou du patron) changé : les aiguilles qui s'en servent sont à revérifier
      const generalChanged = info.myGauge.rows !== project!.myGauge.rows || info.patternGauge.rows !== project!.patternGauge.rows
      if (generalChanged && needleGauges.some((g) => g.checked && g.rows === null)) await api.knitting.saveNeedleGauges(project!.id, withGauges(needleGauges, needleGauges, true))
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

  /** Conversions de l'aiguille vérifiées : valable pour toutes ses sous-étapes. */
  async function checkNeedle(needle: number | null) {
    try {
      await api.knitting.saveNeedleGauges(project!.id, withChecked(needleGauges, needle))
      await reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  /** La sous-étape reçoit un identifiant (enregistré avec ses sous-étapes) pour qu'un diagramme la suive. */
  async function identifySection(stepId: string, index: number): Promise<string | null> {
    const target = steps.find((s) => s.id === stepId)
    const section = target?.sections[index]
    if (!target || !section) return null
    if (section.id) return section.id
    const id = newSectionId()
    const saved = await saveSections(target, target.sections.map((s, i) => (i === index ? { ...s, id } : s)))
    return saved ? id : null
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
    // Mailles de fin : déduites du début saisi, sinon celles du patron
    const stepEnd = endStitches(step)
    const adjustedStitches = adjustCount(stepEnd, gauges.pattern.stitches, gauges.mine.stitches)
    const adjustedRows = adjustCount(step.totalRows, gauges.pattern.rows, gauges.mine.rows)
    const stepText = (
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
    )
    return (
      <>
        <Link to={`/tricot/${project.id}?onglet=preparer`} className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4 shrink-0" aria-hidden /> <span className="truncate">{project.title}</span>
        </Link>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {step.done || isReady(step, needles, needleGauges) ? (
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
              {[`Étape ${index + 1} sur ${steps.length}`, ...stepFacts({ ...step, stitches: stepEnd, times: 1 })].join(' · ')}
              {adjustedStitches !== null && ` (≈ ${adjustedStitches} avec ton échantillon)`}
            </p>
            <h1 id="step-title" className="text-xl font-semibold tracking-tight">
              {step.title}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground tabular-nums">
              <span>
                {step.rowCount}
                {step.totalRows !== null && ` / ${step.totalRows}`} rang{(step.totalRows ?? step.rowCount) > 1 ? 's' : ''}
                {adjustedRows !== null && ` (≈ ${adjustedRows} avec ton échantillon)`}
              </span>
              <span aria-hidden>·</span>
              <StepTimes step={step} onChange={(progress) => void saveStep(step.id, progress)} />
            </p>
            {!step.done && (
              <div className="mt-2">
                <StepReady issues={readyIssues(step, needles, needleGauges)} onFix={setFixSection} />
              </div>
            )}
            <div className="mt-2">
              <StepStartStitches
                start={startStitchesOf(step)}
                set={(step.startStitches ?? null) !== null}
                previous={index > 0 ? endStitches(steps[index - 1]!) : null}
                fromPattern={startStitchesOf({ ...step, startStitches: null })}
                onSave={(startStitches) => saveStep(step.id, { startStitches })}
              />
            </div>
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
          {step.instructions &&
            (step.sections.some((x) => x.source) ? (
              // Chaque sous-étape montre son paragraphe : le texte complet (corrections, traduction) reste à portée
              <Fold id="step-text" title="Texte complet de l’étape" className="p-3 shadow-none sm:p-3">
                {stepText}
              </Fold>
            ) : (
              stepText
            ))}
          <StepSections step={step} needles={needles} text={{ sizes: project.sizes, sizeIndex: project.sizeIndex, abbreviations: project.abbreviations ?? [] }} charts={charts.filter((c) => c.stepId === step.id)} needleGauges={needleGauges} onCheckNeedle={checkNeedle} onSaveGauges={saveNeedleGauges} open={fixSection} onOpened={() => setFixSection(null)} onChange={(sections) => saveSections(step, sections)} />
          <StepCharts
            projectId={project.id}
            pdfPath={project.pdfPath}
            step={step}
            steps={steps}
            charts={charts}
            hints={project.chartHints}
            onChanged={reload}
            identifySection={identifySection}
          />
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

  // Le projet en trois onglets : Démarrer (matériel), Préparer (étapes), Tricoter (étape en cours et suivi)
  const tabInput = { ...project, needles, needleGauges, steps }
  const tabParam = params.get('onglet')
  const tab: ProjectTab = isProjectTab(tabParam) ? tabParam : defaultTab(tabInput)
  const toStart = startIssues(tabInput)
  const toPrepare = stepsToPrepare(steps, needles, needleGauges)
  const organizing = tab === 'preparer' && params.get('vue') === 'organiser'
  const doneCount = steps.filter((s) => s.done).length
  const finished = steps.length > 0 && doneCount === steps.length
  const tabs: { value: ProjectTab; label: string; status: string; todo: boolean }[] = [
    { value: 'demarrer', label: '1. Démarrer', status: toStart.length ? 'à compléter' : 'fait', todo: toStart.length > 0 },
    { value: 'preparer', label: '2. Préparer', status: toPrepare ? `${toPrepare} à préparer` : 'prêtes', todo: toPrepare > 0 },
    { value: 'tricoter', label: '3. Tricoter', status: finished ? 'terminé' : `${doneCount} / ${steps.length}`, todo: false },
  ]

  return (
    <>
      {back}
      <PageHeader
        title={project.title}
        description={`Taille ${followedSize} · ${doneCount} / ${steps.length} étapes`}
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

      <Tabs value={tab} onValueChange={(value) => setParams({ onglet: value as ProjectTab }, { replace: true })} className="gap-4">
        <TabsList aria-label="Temps du projet" className="h-auto w-full">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-col gap-0 py-1.5">
              <span>{t.label}</span>
              <span className={cn('text-xs font-normal', t.todo ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{t.status}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="demarrer" className="space-y-4">
          {toStart.length > 0 && (
            <div role="note" aria-labelledby="knit-start-title" className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p id="knit-start-title" className="flex items-center gap-1.5 font-medium">
                <CircleAlert className="size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden /> Avant de préparer les étapes
              </p>
              <ul className="list-inside list-disc">
                {toStart.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            <SizePicker id="knit-size-index" sizes={project.sizes} sizeIndex={project.sizeIndex} fallback={project.size} onChange={(i) => void changeSize(i)} />
            <ProjectNeedles needles={needles} onSave={saveNeedles} />
          </div>
          <YarnPanel
            defaultOpen
            info={{ yarns: project.yarns, patternGauge: project.patternGauge, myGauge: project.myGauge }}
            onSave={saveInfo}
            needleGauges={{ needles, gauges: needleGauges, onSave: saveNeedleGauges }}
          />
          <AdaptPanel project={project} size={followedSize} onSaved={reload} />
        </TabsContent>

        <TabsContent value="preparer" className="space-y-3">
          {steps.length > 1 && (
            <Tabs value={organizing ? 'organiser' : 'etapes'} onValueChange={(value) => setParams(value === 'organiser' ? { onglet: 'preparer', vue: 'organiser' } : { onglet: 'preparer' }, { replace: true })}>
              <TabsList aria-label="Préparer" className="h-10">
                <TabsTrigger value="etapes" className="px-3">
                  <ListChecks /> Étapes
                </TabsTrigger>
                <TabsTrigger value="organiser" className="px-3">
                  <ListTree /> Organiser
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {organizing ? (
            <OrganizeSteps project={project} reload={reload} />
          ) : (
            <nav aria-label="Étapes">
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
                          {!s.done && !isReady(s, needles, needleGauges) && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium">À préparer</span>}
                          {isCurrent && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium">En cours</span>}
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </nav>
          )}
        </TabsContent>

        <TabsContent value="tricoter" className="space-y-4">
          <CurrentStepCard
            step={current && !current.done ? current : null}
            number={current ? steps.indexOf(current) + 1 : 0}
            total={steps.length}
            issues={current && !current.done ? readyIssues(current, needles, needleGauges) : []}
            knitTo={knitTo()}
            setupTo={current ? `?etape=${encodeURIComponent(current.id)}` : ''}
          />
          <YarnCheckCard yarns={project.yarns} steps={steps} checks={project.yarnChecks ?? []} onSave={saveYarnCheck} />
          <ProgressPanel projectId={project.id} currentStepId={current?.id ?? null} stepTitle={(id) => steps.find((s) => s.id === id)?.title} />
        </TabsContent>
      </Tabs>

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

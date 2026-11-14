import { Check, ChevronLeft, ChevronRight, FileText, ListTree, Play, SearchX, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { effectiveNeedles, sanitizeNeedles } from '../lib/needles'
import { OfflineNote } from '../components/OfflineNote'
import { Fold } from '../components/Fold'
import { StepNotes } from '../components/StepNotes'
import { StepTimes } from '../components/StepTimes'
import { StepReady } from '../components/StepReady'
import { StepStartStitches } from '../components/StepStartStitches'
import { endStitches, startStitchesOf } from '../lib/stitches'
import { ProjectNeedles } from '../components/ProjectNeedles'
import { countsFor, withChecked, type ProjectGauge } from '../lib/gauges'
import { isReady, readyIssues } from '../lib/ready'
import { describePass } from '../lib/passes'
import { defaultTab, isProjectTab, startIssues, stepsToPrepare, type ProjectTab } from '../lib/phases'
import { CurrentStepCard } from '../components/CurrentStepCard'
import { Note } from '../components/Note'
import { BackLink } from '../components/BackLink'
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
  // Arrivée depuis une sous-étape à convertir : l'échantillon de cette aiguille s'ouvre (« defaut » : celui par défaut).
  const gaugeParam = params.get('echantillon')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Sous-étape à ouvrir, demandée depuis « À préparer ».
  const [fixSection, setFixSection] = useState<number | null>(null)

  const back = <BackLink to="/tricot">Tricot</BackLink>

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
  const projectGauges = project.gauges ?? []
  // Les aiguilles proposées aux sous-étapes : celles du patron, plus celles où elle a tricoté un échantillon.
  const needleChoices = sanitizeNeedles([...needles, ...projectGauges.map((g) => g.needle)])
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

  /**
   * Mailles et rangs à suivre pour une étape : l'échantillon de son aiguille (celle de sa première sous-étape, ou
   * celle héritée). L'estimation (≈) n'a plus lieu d'être quand le patron adapté est déjà recalculé.
   */
  const gaugeOfStep = (s: ShownStep) =>
    following ? project.patternGauge : countsFor(projectGauges, effectiveNeedles(s.sections, needles, s.needleFrom ?? null)[0] ?? s.needleFrom ?? null, project.patternGauge)

  /** Les échantillons du projet : la seule source pour les calculs des étapes. */
  async function saveGauges(next: ProjectGauge[]): Promise<boolean> {
    try {
      await api.knitting.saveGauges(project!.id, next)
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

  /** Total de rangs de l'étape repris sur ses sous-étapes (elles le dépassaient). */
  async function setTotalRows(target: ShownStep, totalRows: number): Promise<void> {
    try {
      await api.knitting.saveSections([{ id: target.id, sections: target.sections, totalRows, instructions: target.instructions }])
      await reload()
    } catch (error) {
      toast.error(errorMessage(error))
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
      await api.knitting.saveGauges(project!.id, withChecked(projectGauges, needle))
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
    const mine = gaugeOfStep(step)
    const adjustedStitches = adjustCount(stepEnd, project.patternGauge.stitches, mine.stitches)
    const adjustedRows = adjustCount(step.totalRows, project.patternGauge.rows, mine.rows)
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
        <BackLink to={`/tricot/${project.id}?onglet=preparer`}>{project.title}</BackLink>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {step.done || isReady(step, needles, projectGauges) ? (
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
                <StepReady issues={readyIssues(step, needles, projectGauges)} onFix={setFixSection} />
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
              <Note className="mt-2" title={`Patron adapté${step.adapted.note ? ` : ${step.adapted.note}` : ''}`}>
                <p className="text-xs text-muted-foreground">
                  Patron d’origine : {step.adapted.original.totalRows ?? '?'} rangs, {step.adapted.original.stitches ?? '?'} mailles à la fin.
                </p>
              </Note>
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
          <StepSections step={step} needles={needles} choices={needleChoices} text={{ sizes: project.sizes, sizeIndex: project.sizeIndex, abbreviations: project.abbreviations ?? [] }} charts={charts.filter((c) => c.stepId === step.id)} gauges={projectGauges} onCheckNeedle={checkNeedle} onSetTotalRows={step.adapted ? undefined : (rows) => setTotalRows(step, rows)} open={fixSection} onOpened={() => setFixSection(null)} onChange={(sections) => saveSections(step, sections)} />
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
              <Undo2 /> Rouvrir l’étape
            </Button>
          )}
        </article>
      </>
    )
  }

  // Le projet en trois onglets : Démarrer (matériel), Préparer (étapes), Tricoter (étape en cours et suivi)
  const tabInput = { ...project, needles, gauges: projectGauges, steps }
  const tabParam = params.get('onglet')
  const tab: ProjectTab = isProjectTab(tabParam) ? tabParam : defaultTab(tabInput)
  const toStart = startIssues(tabInput)
  const toPrepare = stepsToPrepare(steps, needles, projectGauges)
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
        titleAction={
          <div className="flex items-center gap-1">
            {project.pdfPath && (
              <Button variant="ghost" size="icon-touch" aria-label="Voir le PDF" onClick={() => void openPdf()}>
                <FileText />
              </Button>
            )}
            <Button variant="ghost" size="icon-touch" aria-label="Supprimer le projet" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </div>
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
            <Note kind="todo" title="Avant de préparer les étapes">
              <ul className="list-inside list-disc">
                {toStart.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Note>
          )}
          <div className="space-y-2">
            <SizePicker id="knit-size-index" sizes={project.sizes} sizeIndex={project.sizeIndex} fallback={project.size} onChange={(i) => void changeSize(i)} />
            <ProjectNeedles needles={needles} onSave={saveNeedles} />
          </div>
          <YarnPanel
            defaultOpen
            info={{ yarns: project.yarns, patternGauge: project.patternGauge }}
            onSave={saveInfo}
            gauges={{
              needles,
              list: projectGauges,
              onSave: saveGauges,
              openFor: gaugeParam === null ? undefined : gaugeParam === 'defaut' ? null : Number(gaugeParam),
              onOpened: () => setParams({ onglet: 'demarrer' }, { replace: true }),
            }}
          />
          <AdaptPanel project={project} size={followedSize} onSaved={reload} />
        </TabsContent>

        <TabsContent value="preparer" className="space-y-3">
          {/* Une seule barre d'onglets : organiser est une action sur la liste, pas un autre temps du projet. */}
          {steps.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                {organizing ? 'Organiser les étapes' : `${steps.length} étapes`}
              </h2>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setParams(organizing ? { onglet: 'preparer' } : { onglet: 'preparer', vue: 'organiser' }, { replace: true })}
              >
                {organizing ? <ChevronLeft /> : <ListTree />}
                {organizing ? 'Retour aux étapes' : 'Organiser'}
              </Button>
            </div>
          )}
          {organizing ? (
            <OrganizeSteps project={project} reload={reload} />
          ) : (
            <nav aria-label="Étapes">
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune étape : la lecture du patron n’en a trouvé aucune.</p>
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
                          {/* Le numéro reste lisible même terminée : la numérotation ne saute pas. */}
                          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs', s.done ? 'bg-brand/15 font-medium text-brand' : 'bg-muted')} aria-hidden>
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('flex items-center gap-1.5', isCurrent && 'font-medium')}>
                              {s.done && <Check className="size-3.5 shrink-0 text-brand" aria-hidden />}
                              <span className="truncate">{s.title}</span>
                            </span>
                            {(s.rowCount > 0 || s.totalRows !== null || s.times > 1) && (
                              <span className="block text-xs text-muted-foreground tabular-nums">
                                {s.rowCount}
                                {s.totalRows !== null && ` / ${s.totalRows}`} rangs
                                {describePass(s) && ` · ${describePass(s)}`}
                              </span>
                            )}
                            {/* Les pastilles sous le titre : elles ne le rognent pas. */}
                            {(isCurrent || (!s.done && !isReady(s, needles, projectGauges))) && (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {isCurrent && <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium">En cours</span>}
                                {!s.done && !isReady(s, needles, projectGauges) && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium">À préparer</span>}
                              </span>
                            )}
                          </span>
                          {s.done && <span className="sr-only">(terminée)</span>}
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
            issues={current && !current.done ? readyIssues(current, needles, projectGauges) : []}
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
        description="Les étapes, rangs comptés et notes seront supprimés. Le patron reste dans ta bibliothèque."
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </>
  )
}

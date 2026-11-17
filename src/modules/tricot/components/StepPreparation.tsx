// Préparation d'une étape (?etape=<id>) : texte, sous-étapes, diagrammes, notes. On tricote ensuite dans le mode
// tricoter (/tricot/:id/tricoter).

import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/text'
import { BackIcon, ChartIcon, KnitIcon, NotesIcon, OpenIcon, PdfIcon, StepsIcon, UndoIcon } from './KnitIcons'
import { StepText } from './SizedText'
import { StepCharts } from './StepCharts'
import { StepSections } from './StepSections'
import { Fold } from './Fold'
import { StepNotes } from './StepNotes'
import { StepTimes } from './StepTimes'
import { StepReady } from './StepReady'
import { StepStartStitches } from './StepStartStitches'
import { Note } from './Note'
import { BackLink } from './BackLink'
import { HelpTip } from './HelpTip'
import type { KnitProjectState } from '../hooks/useKnitProject'
import type { ShownStep } from '../lib/adapt'
import { adjustCount, withChecked } from '../lib/gauges'
import { newSectionId, stepFacts, type KnitProject } from '../lib/pattern'
import { endStitches, startStitchesOf } from '../lib/stitches'
import { isReady, readyIssues } from '../lib/ready'
import { isStarted } from '../lib/organize'
import { CHARTS_HELP, SECTIONS_HELP } from '../lib/help'
import { gaugeOfStep, type ProjectView } from '../lib/projectView'

/** Les blocs de la préparation d'une étape : une carte légère dans la carte de l'étape. */
const PART = 'p-3 shadow-none sm:p-3'

interface Props {
  project: KnitProject
  view: ProjectView
  step: ShownStep
  knit: Pick<KnitProjectState, 'saveStep' | 'saveSections' | 'translateStep' | 'mutate' | 'reload'>
  /** Adresse du mode tricoter, sur une étape. */
  knitTo: (stepId: string) => string
  /** Hors ligne, avancée en attente. */
  offlineNote: ReactNode
}

export function StepPreparation({ project, view, step, knit, knitTo, offlineNote }: Props) {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  // Sous-étape à ouvrir, demandée depuis le mode tricoter (?sous-etape=2, à partir de 1).
  const sectionParam = Number(params.get('sous-etape')) || null
  // Sous-étape à ouvrir, demandée depuis « À préparer ».
  const [fixSection, setFixSection] = useState<number | null>(null)
  // Blocs de la préparation ouverts à la main, par étape (« s1:sections ») ; sinon repliés, sauf ce qui est à préparer.
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({})

  const { steps, needles, gauges, charts } = view
  const adaptation = project.adaptation ?? null
  const index = steps.indexOf(step)
  /** Ouvre une étape ; d'une étape à l'autre, le retour ramène quand même à la liste. */
  const openStep = (stepId: string) => setParams({ etape: stepId }, { replace: true })

  /** La sous-étape reçoit un identifiant (enregistré avec ses sous-étapes) pour qu'un diagramme la suive. */
  async function identifySection(stepId: string, sectionIndex: number): Promise<string | null> {
    const target = steps.find((s) => s.id === stepId)
    const section = target?.sections[sectionIndex]
    if (!target || !section) return null
    if (section.id) return section.id
    const id = newSectionId()
    const saved = await knit.saveSections(target, target.sections.map((s, i) => (i === sectionIndex ? { ...s, id } : s)))
    return saved ? id : null
  }

  const issues = step.done ? [] : readyIssues(step, needles, gauges)
  const toFix = issues.length
  const stepCharts = charts.filter((c) => c.stepId === step.id)
  const partKey = (part: string) => `${step.id}:${part}`
  /** Ouvert à la main, sinon replié (ou ouvert d'office quand il y a à préparer dedans). */
  const partOpen = (part: string, byDefault = false) => unfolded[partKey(part)] ?? byDefault
  const togglePart = (part: string, byDefault = false) => setUnfolded((o) => ({ ...o, [partKey(part)]: !(o[partKey(part)] ?? byDefault) }))
  const unfold = (part: string) => setUnfolded((o) => ({ ...o, [partKey(part)]: true }))
  // Mailles de fin : déduites du début saisi, sinon celles du patron
  const stepEnd = endStitches(step)
  const mine = gaugeOfStep(project, view, step)
  const adjustedStitches = adjustCount(stepEnd, project.patternGauge.stitches, mine.stitches)
  const adjustedRows = adjustCount(step.totalRows, project.patternGauge.rows, mine.rows)

  return (
    <>
      <BackLink to={`/tricot/${project.id}?onglet=preparer`}>{project.title}</BackLink>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {step.done || isReady(step, needles, gauges) ? (
          <Link to={knitTo(step.id)} className={cn(buttonVariants(), 'h-10')}>
            <KnitIcon /> Tricoter cette étape
          </Link>
        ) : (
          <Button className="h-10" disabled aria-describedby="step-ready-title">
            <KnitIcon /> Tricoter cette étape
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="icon-lg" aria-label="Étape précédente" disabled={index === 0} onClick={() => openStep(steps[index - 1]!.id)}>
            <BackIcon />
          </Button>
          <Button variant="outline" size="icon-lg" aria-label="Étape suivante" disabled={index === steps.length - 1} onClick={() => openStep(steps[index + 1]!.id)}>
            <OpenIcon />
          </Button>
        </div>
      </div>
      {offlineNote}

      <article key={step.id} aria-labelledby="step-title" className="space-y-4 rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
        <header>
          <p className="text-xs text-muted-foreground">
            Étape {index + 1} sur {steps.length}
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
            <StepTimes step={step} onChange={(progress) => void knit.saveStep(step.id, progress)} />
          </p>
          {/* Le total de rangs est sur la ligne d'avancée : ici, seulement les mailles à la fin. */}
          {stepEnd !== null && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {stepFacts({ totalRows: null, stitches: stepEnd })}
              {adjustedStitches !== null && ` (≈ ${adjustedStitches} avec ton échantillon)`}
            </p>
          )}
          {!step.done && (
            <div className="mt-2">
              <StepReady
                issues={issues}
                onFix={(i) => {
                  unfold('sections')
                  setFixSection(i)
                }}
              />
            </div>
          )}
          <div className="mt-2">
            <StepStartStitches
              start={startStitchesOf(step)}
              set={(step.startStitches ?? null) !== null}
              previous={index > 0 ? endStitches(steps[index - 1]!) : null}
              fromPattern={startStitchesOf({ ...step, startStitches: null })}
              onSave={(startStitches) => knit.saveStep(step.id, { startStitches })}
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
        {/* Les parties de l'étape : le même bloc repliable, replié par défaut ; les sous-étapes s'ouvrent s'il y a à préparer. */}
        {step.instructions && (
          <Fold
            id="step-text"
            title={
              <>
                <PdfIcon className="size-4" aria-hidden /> {step.sections.some((x) => x.source) ? 'Texte complet de l’étape' : 'Texte du patron'}
              </>
            }
            className={PART}
            open={partOpen('text')}
            onToggle={() => togglePart('text')}
          >
            <StepText
              text={step.instructions}
              sizes={project.sizes}
              sizeIndex={project.sizeIndex}
              highlights={step.highlights}
              onChange={(highlights) => void knit.saveStep(step.id, { highlights })}
              abbreviations={project.abbreviations ?? []}
              translation={step.translation ?? null}
              onTranslate={() => knit.translateStep(step.id, step.instructions)}
            />
          </Fold>
        )}
        <Fold
          id={`sections-${step.id}`}
          title={
            <>
              <StepsIcon className="size-4" aria-hidden /> Sous-étapes
            </>
          }
          summary={[plural(step.sections.length, 'sous-étape'), toFix > 0 && `${toFix} à régler`].filter(Boolean).join(' · ') || 'aucune'}
          action={<HelpTip label="sous-étapes">{SECTIONS_HELP}</HelpTip>}
          className={PART}
          open={partOpen('sections', toFix > 0 || sectionParam !== null)}
          onToggle={() => togglePart('sections', toFix > 0)}
        >
          {/* Ouvert d'office (à préparer) : un geste dedans le garde ouvert, même quand il n'y a plus rien à régler. */}
          <div onClickCapture={() => unfold('sections')}>
            <StepSections
              headless
              step={step}
              needles={needles}
              choices={view.needleChoices}
              text={{ sizes: project.sizes, sizeIndex: project.sizeIndex, abbreviations: project.abbreviations ?? [] }}
              charts={stepCharts}
              gauges={gauges}
              onCheckNeedle={async (needle) => {
                // Conversions de l'aiguille vérifiées : valable pour toutes ses sous-étapes.
                await knit.mutate(() => api.knitting.saveGauges(project.id, withChecked(gauges, needle)))
              }}
              onSetTotalRows={
                step.adapted
                  ? undefined
                  : async (totalRows) => {
                      // Total de rangs de l'étape repris sur ses sous-étapes (elles le dépassaient).
                      await knit.mutate(() => api.knitting.saveSections([{ id: step.id, sections: step.sections, totalRows, instructions: step.instructions }]))
                    }
              }
              open={fixSection ?? (sectionParam !== null ? sectionParam - 1 : null)}
              onOpened={() => {
                setFixSection(null)
                // Ouverte une fois : l'adresse ne la rouvre plus
                if (sectionParam !== null) setParams({ etape: step.id }, { replace: true })
              }}
              organizeTo={adaptation || isStarted(step) ? undefined : `/tricot/${project.id}?onglet=preparer&vue=organiser`}
              onChange={(sections) => knit.saveSections(step, sections)}
            />
          </div>
        </Fold>
        <Fold
          id={`charts-${step.id}`}
          title={
            <>
              <ChartIcon className="size-4" aria-hidden /> Diagrammes
            </>
          }
          summary={stepCharts.length > 0 ? plural(stepCharts.length, 'diagramme') : 'aucun'}
          action={<HelpTip label="diagrammes">{CHARTS_HELP}</HelpTip>}
          className={PART}
          open={partOpen('charts')}
          onToggle={() => togglePart('charts')}
        >
          <StepCharts headless projectId={project.id} pdfPath={project.pdfPath} step={step} steps={steps} charts={charts} hints={project.chartHints} onChanged={knit.reload} identifySection={identifySection} />
        </Fold>
        <Fold
          id={`notes-part-${step.id}`}
          title={
            <>
              <NotesIcon className="size-4" aria-hidden /> Notes de l’étape
            </>
          }
          summary={step.notes.trim() ? 'notes' : 'rien de noté'}
          className={PART}
          open={partOpen('notes')}
          onToggle={() => togglePart('notes')}
        >
          <StepNotes key={step.id} hideLabel step={step} onSave={(notes) => knit.saveStep(step.id, { notes })} />
        </Fold>
        {step.done && (
          <Button variant="outline" className="h-10" onClick={() => void knit.saveStep(step.id, { done: false })}>
            <UndoIcon /> Rouvrir l’étape
          </Button>
        )}
      </article>
      {/* En bas d'une longue préparation : passer à l'étape voisine sans remonter. */}
      {steps.length > 1 && (
        <nav aria-label="Étapes voisines" className="mt-3 grid grid-cols-2 gap-2">
          {index > 0 ? (
            <Button variant="outline" className="h-11 min-w-0 justify-start" onClick={() => openStep(steps[index - 1]!.id)}>
              <BackIcon /> <span className="truncate">{steps[index - 1]!.title}</span>
            </Button>
          ) : (
            <span />
          )}
          {index < steps.length - 1 && (
            <Button variant="outline" className="h-11 min-w-0 justify-end" onClick={() => openStep(steps[index + 1]!.id)}>
              <span className="truncate">{steps[index + 1]!.title}</span> <OpenIcon />
            </Button>
          )}
        </nav>
      )}
    </>
  )
}

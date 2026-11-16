// Le projet en trois onglets : Démarrer (matériel), Préparer (étapes), Tricoter (étape en cours et suivi).

import { useSearchParams } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BackIcon, OrganizeIcon } from './KnitIcons'
import { SizePicker } from './SizedText'
import { YarnCheckCard } from './YarnCheckCard'
import { ProgressPanel } from './ProgressPanel'
import { AdaptPanel } from './AdaptPanel'
import { YarnPanel, type ProjectInfo } from './YarnPanel'
import { ProjectNeedles } from './ProjectNeedles'
import { CurrentStepCard } from './CurrentStepCard'
import { Note } from './Note'
import { Fold } from './Fold'
import { OrganizeSteps } from './OrganizeSteps'
import { StepList } from './StepList'
import type { KnitProjectState } from '../hooks/useKnitProject'
import { withoutYarn, withYarnCheck, type YarnCheck } from '../lib/yarnLeft'
import { formatNeedle } from '../lib/needles'
import type { ProjectGauge } from '../lib/gauges'
import { readyIssues } from '../lib/ready'
import { defaultTab, isProjectTab, startIssues, stepsToPrepare, type ProjectTab } from '../lib/phases'
import type { KnitProject } from '../lib/pattern'
import type { ProjectView } from '../lib/projectView'

interface Props {
  project: KnitProject
  view: ProjectView
  knit: Pick<KnitProjectState, 'mutate' | 'reload'>
  /** Adresse du mode tricoter (étape en cours). */
  knitTo: string
}

export function ProjectTabs({ project, view, knit, knitTo }: Props) {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const { steps, needles, gauges, current } = view
  // Arrivée depuis une sous-étape à convertir : l'échantillon de cette aiguille s'ouvre (« defaut » : celui par défaut).
  const gaugeParam = params.get('echantillon')

  const tabInput = { ...project, needles, gauges, steps }
  const tabParam = params.get('onglet')
  const tab: ProjectTab = isProjectTab(tabParam) ? tabParam : defaultTab(tabInput)
  const toStart = startIssues(tabInput)
  const toPrepare = stepsToPrepare(steps, needles, gauges)
  const organizing = tab === 'preparer' && params.get('vue') === 'organiser'
  const doneCount = steps.filter((s) => s.done).length
  const finished = steps.length > 0 && doneCount === steps.length
  const tabs: { value: ProjectTab; label: string; status: string; todo: boolean }[] = [
    { value: 'demarrer', label: '1. Démarrer', status: toStart.length ? 'à compléter' : 'fait', todo: toStart.length > 0 },
    { value: 'preparer', label: '2. Préparer', status: toPrepare ? `${toPrepare} à préparer` : 'prêtes', todo: toPrepare > 0 },
    { value: 'tricoter', label: '3. Tricoter', status: finished ? 'terminé' : `${doneCount} / ${steps.length}`, todo: false },
  ]

  /** Laine et échantillon ; laine retirée : les pesées restent liées à la bonne laine, dans la même écriture. */
  function saveInfo(info: ProjectInfo, removedYarn?: number): Promise<boolean> {
    const checks = project.yarnChecks ?? []
    const shifted = removedYarn !== undefined && checks.some((c) => c.yarn >= removedYarn) ? withoutYarn(checks, removedYarn) : undefined
    return knit.mutate(() => (shifted ? api.knitting.saveProjectInfo(project.id, info, shifted) : api.knitting.saveProjectInfo(project.id, info)))
  }

  /** Les échantillons du projet : la seule source pour les calculs des étapes. */
  const saveGauges = (next: ProjectGauge[]) => knit.mutate(() => api.knitting.saveGauges(project.id, next))
  const saveNeedles = (next: number[]) => knit.mutate(() => api.knitting.saveNeedles(project.id, next))
  const saveYarnCheck = (check: YarnCheck) => knit.mutate(() => api.knitting.saveYarnChecks(project.id, withYarnCheck(project.yarnChecks ?? [], check)))
  const changeSize = (sizeIndex: number | null) => void knit.mutate(() => api.knitting.setSizeIndex(project.id, sizeIndex))

  return (
    <Tabs value={tab} onValueChange={(value) => setParams({ onglet: value as ProjectTab }, { replace: true })} className="gap-4">
      <TabsList aria-label="Temps du projet" className="h-auto w-full group-data-horizontal/tabs:h-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="h-auto min-h-11 min-w-0 flex-col gap-0 py-1.5 leading-tight whitespace-normal">
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
        {/* Même bloc repliable que les autres : la taille et les aiguilles, résumées quand c'est replié. */}
        <Fold
          id="knit-size-needles"
          title="Taille et aiguilles"
          summary={[`Taille ${view.size}`, needles.length ? `aiguilles ${needles.map(formatNeedle).join(' · ')}` : 'aiguilles à indiquer'].join(' · ')}
        >
          <SizePicker id="knit-size-index" sizes={project.sizes} sizeIndex={project.sizeIndex} fallback={project.size} onChange={changeSize} />
          <ProjectNeedles needles={needles} onSave={saveNeedles} />
        </Fold>
        <YarnPanel
          // Ouvert seulement quand on arrive pour noter un échantillon (depuis une sous-étape à convertir).
          defaultOpen={gaugeParam !== null}
          info={{ yarns: project.yarns, patternGauge: project.patternGauge }}
          onSave={saveInfo}
          gauges={{
            needles,
            list: gauges,
            onSave: saveGauges,
            openFor: gaugeParam === null ? undefined : gaugeParam === 'defaut' ? null : Number(gaugeParam),
            onOpened: () => setParams({ onglet: 'demarrer' }, { replace: true }),
          }}
        />
        <AdaptPanel project={project} size={view.size} onSaved={knit.reload} />
      </TabsContent>

      <TabsContent value="preparer" className="space-y-3">
        {/* Une seule barre d'onglets : organiser est une action sur la liste, pas un autre temps du projet. */}
        {steps.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{organizing ? 'Organiser les étapes' : `${steps.length} étapes`}</h2>
            <Button variant="outline" className="h-10" onClick={() => setParams(organizing ? { onglet: 'preparer' } : { onglet: 'preparer', vue: 'organiser' }, { replace: true })}>
              {organizing ? <BackIcon /> : <OrganizeIcon />}
              {organizing ? 'Retour aux étapes' : 'Organiser'}
            </Button>
          </div>
        )}
        {organizing ? <OrganizeSteps project={project} reload={knit.reload} /> : <StepList steps={steps} current={current} needles={needles} gauges={gauges} />}
      </TabsContent>

      <TabsContent value="tricoter" className="space-y-4">
        <CurrentStepCard
          step={current && !current.done ? current : null}
          number={current ? steps.indexOf(current) + 1 : 0}
          total={steps.length}
          issues={current && !current.done ? readyIssues(current, needles, gauges) : []}
          knitTo={knitTo}
          setupTo={current ? `?etape=${encodeURIComponent(current.id)}` : ''}
        />
        <YarnCheckCard yarns={project.yarns} steps={steps} checks={project.yarnChecks ?? []} onSave={saveYarnCheck} />
        <ProgressPanel projectId={project.id} currentStepId={current?.id ?? null} stepTitle={(id) => steps.find((s) => s.id === id)?.title} />
      </TabsContent>
    </Tabs>
  )
}

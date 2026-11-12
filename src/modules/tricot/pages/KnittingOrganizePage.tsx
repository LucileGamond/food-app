import { ArrowDown, ArrowUp, ChevronLeft, Combine, MoreHorizontal, MoveRight, SearchX, Split as SplitIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useKnitProject } from '../hooks/useKnitProject'
import { stepsToFollow, type ShownStep } from '../lib/adapt'
import { mergeBlocker, mergeSteps } from '../lib/merge'
import { isStarted, moveSection, splitStep } from '../lib/organize'
import { describeSection, type KnitProject } from '../lib/pattern'

/**
 * Organiser les étapes d'un projet : regrouper une étape avec la suivante, séparer une étape, déplacer une sous-étape
 * (dans son étape ou vers une autre). Le texte du patron, les diagrammes et les photos restent dans leur étape.
 */
export function KnittingOrganizePage() {
  const { id = '' } = useParams()
  const api = useApi()
  const knit = useKnitProject(api, id)
  const back = (
    <Link to={`/tricot/${id}`} className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4 shrink-0" aria-hidden /> <span className="truncate">{knit.project?.title ?? 'Projet'}</span>
    </Link>
  )
  const shell = (children: ReactNode) => (
    <>
      {back}
      {children}
    </>
  )
  if (knit.loadError) return shell(<LoadError message={knit.loadError} onRetry={() => void knit.reload()} />)
  if (knit.loading) return shell(<Skeleton className="h-48 rounded-2xl" aria-label="Chargement du projet" />)
  if (!knit.project) return shell(<EmptyState icon={SearchX} title="Projet introuvable" description="Il a peut-être été supprimé." />)
  return shell(<Organize project={knit.project} reload={knit.reload} />)
}

type Pending = { kind: 'merge'; index: number } | { kind: 'split'; index: number; section: number } | { kind: 'move'; index: number; section: number }

function Organize({ project, reload }: { project: KnitProject; reload: () => Promise<unknown> }) {
  const api = useApi()
  const { steps } = stepsToFollow(project)
  const adapted = !!project.adaptation
  const [pending, setPending] = useState<Pending | null>(null)
  const [target, setTarget] = useState('')

  async function run(action: () => Promise<void>) {
    try {
      await action()
      await reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  /** Sous-étape montée ou descendue dans son étape. */
  function shiftWithin(step: ShownStep, index: number, by: -1 | 1) {
    const sections = [...step.sections]
    const [moved] = sections.splice(index, 1)
    sections.splice(index + by, 0, moved!)
    void run(() => api.knitting.saveSections([{ id: step.id, sections, totalRows: step.totalRows }]))
  }

  const pendingStep = pending ? steps[pending.index]! : null
  const moveTargets = pending?.kind === 'move' ? steps.filter((s, i) => i !== pending.index && !isStarted(s)) : []

  return (
    <>
      <PageHeader title="Organiser les étapes" description="Regroupe, sépare et déplace les sous-étapes lues dans le patron." />
      <p role="note" className="mb-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        Seules les sous-étapes bougent : le texte du patron, les diagrammes et les photos restent dans leur étape. Une étape commencée ne se réorganise plus.
      </p>
      {adapted && (
        <p role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Le patron a une adaptation : supprime-la pour organiser les étapes.
        </p>
      )}
      <ol aria-label="Étapes" className="space-y-3">
        {steps.map((step, index) => {
          const locked = adapted || isStarted(step)
          const next = steps[index + 1] ?? null
          const mergeLock = next ? mergeBlocker(next, adapted) : 'Dernière étape'
          return (
            <li key={step.id} className="rounded-2xl border bg-background p-3 shadow-xs">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    Étape {index + 1}
                    {step.totalRows !== null && ` · ${step.totalRows} rangs`}
                    {isStarted(step) && ' · commencée'}
                  </p>
                  <h2 className="font-medium">{step.title}</h2>
                </div>
                <Button variant="outline" className="h-9 shrink-0" disabled={mergeLock !== null} onClick={() => setPending({ kind: 'merge', index })} aria-label={`Regrouper avec la suivante : « ${step.title} »`}>
                  <Combine /> <span className="hidden sm:inline">Regrouper avec la suivante</span>
                </Button>
              </div>
              {step.sections.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Pas de sous-étape.</p>
              ) : (
                <ol aria-label={`Sous-étapes de « ${step.title} »`} className="mt-2 space-y-1">
                  {step.sections.map((section, s) => (
                    <li key={s} className="flex items-center gap-2 rounded-xl bg-muted/50 py-1 pr-1 pl-3 text-sm">
                      <span className="min-w-0 flex-1">{describeSection(section)}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={locked} aria-label={`Actions pour « ${describeSection(section)} »`} />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuItem disabled={s === 0} onClick={() => shiftWithin(step, s, -1)}>
                            <ArrowUp /> Monter
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={s === step.sections.length - 1} onClick={() => shiftWithin(step, s, 1)}>
                            <ArrowDown /> Descendre
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!steps.some((other, i) => i !== index && !isStarted(other))}
                            onClick={() => {
                              setTarget('')
                              setPending({ kind: 'move', index, section: s })
                            }}
                          >
                            <MoveRight /> Déplacer vers une autre étape
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={s === 0} onClick={() => setPending({ kind: 'split', index, section: s })}>
                            <SplitIcon /> Nouvelle étape à partir d’ici
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          )
        })}
      </ol>

      <ConfirmDialog
        open={pending?.kind === 'merge'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Regrouper avec l’étape suivante ?"
        description={pending?.kind === 'merge' ? `« ${steps[pending.index + 1]?.title} » devient la suite de « ${pendingStep?.title} ».` : undefined}
        confirmLabel="Regrouper"
        onConfirm={() => {
          const step = pendingStep!
          return run(() => api.knitting.mergeSteps(step.id, mergeSteps(step, steps[pending!.index + 1]!)))
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'split'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Nouvelle étape à partir d’ici ?"
        description={pending?.kind === 'split' ? `Les sous-étapes de « ${pendingStep?.title} » à partir de celle-ci deviennent une nouvelle étape juste après.` : undefined}
        confirmLabel="Séparer"
        onConfirm={() => {
          const step = pendingStep!
          return run(() => api.knitting.splitStep(step.id, splitStep(step, (pending as { section: number }).section)))
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'move'}
        onOpenChange={(open) => !open && setPending(null)}
        title="Déplacer vers une autre étape"
        description={pending?.kind === 'move' ? `« ${describeSection(pendingStep!.sections[pending.section]!)} » ira à la fin de l’étape choisie.` : undefined}
        confirmLabel="Déplacer"
        confirmDisabled={!target}
        onConfirm={() => {
          const from = pendingStep!
          const to = steps.find((s) => s.id === target)!
          return run(() => api.knitting.saveSections(moveSection(from, (pending as { section: number }).section, to)))
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="move-target">Étape</Label>
          <NativeSelect id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choisir…</option>
            {moveTargets.map((s) => (
              <option key={s.id} value={s.id}>
                {steps.indexOf(s) + 1}. {s.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      </ConfirmDialog>
    </>
  )
}

import { ArrowRight, BellRing, Check, SearchX, ChevronLeft, ChevronRight, FileText, Minus, MoreHorizontal, Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { NativeSelect } from '@/components/ui/native-select'
import { LoadError } from '@/components/LoadError'
import { cn } from '@/lib/utils'
import { StepSections } from '../components/StepSections'
import { useKnitProject } from '../hooks/useKnitProject'
import { alertsAt, currentStepIndex, describeSection, MAX_ROW_COUNT, type KnitStep } from '../lib/pattern'

function RowCounter({ step, onCount }: { step: KnitStep; onCount: (delta: number) => void }) {
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
  const { project, loading, loadError, reload, saveStep, countRows } = useKnitProject(api, id)
  const [selected, setSelected] = useState<string | null>(null)
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

  const steps = project.steps
  const step = steps.find((s) => s.id === selected) ?? steps[currentStepIndex(steps)]!
  const index = steps.indexOf(step)

  async function openPdf() {
    // Onglet ouvert tout de suite (sinon bloqué après l'attente), puis dirigé vers le PDF.
    const tab = window.open('', '_blank')
    try {
      const url = await api.knitting.pdfUrl(project!.pdfPath!)
      if (tab) tab.location.href = url
      else window.location.href = url
    } catch (error) {
      tab?.close()
      toast.error(errorMessage(error))
    }
  }

  async function finishStep() {
    if (await saveStep(step.id, { done: true })) setSelected(steps[index + 1]?.id ?? step.id)
  }

  async function remove() {
    try {
      await api.knitting.deleteProject(project!)
      toast.success('Projet supprimé')
      navigate('/tricot')
    } catch (error) {
      toast.error(errorMessage(error))
    }
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Téléphone : choix de l'étape et étape précédente / suivante. */}
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="outline" size="icon-lg" aria-label="Étape précédente" disabled={index === 0} onClick={() => setSelected(steps[index - 1]!.id)}>
            <ChevronLeft />
          </Button>
          <label htmlFor="step-select" className="sr-only">
            Étape
          </label>
          <NativeSelect id="step-select" className="flex-1" value={step.id} onChange={(e) => setSelected(e.target.value)}>
            {steps.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
                {s.done ? ' ✓' : ''}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="icon-lg" aria-label="Étape suivante" disabled={index === steps.length - 1} onClick={() => setSelected(steps[index + 1]!.id)}>
            <ChevronRight />
          </Button>
        </div>

        <nav aria-label="Étapes" className="hidden md:block">
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={s.id === step.id ? 'step' : undefined}
                  onClick={() => setSelected(s.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm',
                    s.id === step.id ? 'border-brand bg-brand/5 font-medium' : 'bg-background hover:bg-muted/50',
                  )}
                >
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-xs', s.done ? 'bg-brand text-white' : 'bg-muted')} aria-hidden>
                    {s.done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                  {s.done && <span className="sr-only">(terminée)</span>}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article key={step.id} aria-labelledby="step-title" className="space-y-4 rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
          <header>
            <p className="text-xs text-muted-foreground">
              Étape {index + 1} sur {steps.length}
              {step.stitches && ` · ${step.stitches} mailles à la fin`}
            </p>
            <h2 id="step-title" className="text-lg font-semibold">
              {step.title}
            </h2>
          </header>
          {step.instructions && <p className="text-sm whitespace-pre-line">{step.instructions}</p>}
          <RowCounter step={step} onCount={(delta) => void countRows(step.id, delta)} />
          <StepSections step={step} onChange={(sections) => saveStep(step.id, { sections })} onCount={(delta) => void countRows(step.id, delta)} />
          <Notes step={step} onSave={(notes) => void saveStep(step.id, { notes })} />
          <div className="flex flex-wrap gap-2">
            {step.done ? (
              <Button variant="outline" className="h-10" onClick={() => void saveStep(step.id, { done: false })}>
                <Undo2 /> Reprendre l’étape
              </Button>
            ) : (
              <Button className="h-10" onClick={() => void finishStep()}>
                <Check /> Étape terminée
              </Button>
            )}
          </div>
        </article>
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

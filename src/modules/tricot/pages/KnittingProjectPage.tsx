import { SearchX } from 'lucide-react'
import { DeleteIcon, PatternsIcon, PdfIcon } from '../components/KnitIcons'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { ItemAction } from '../components/ItemAction'
import { LoadError } from '@/components/LoadError'
import { cn } from '@/lib/utils'
import { TOUCH_AREA } from '../lib/touch'
import { openInNewTab } from '@/lib/openInNewTab'
import { projectHues } from '../lib/yarn'
import { useYarnHue } from '../components/TricotTheme'
import { useKnitProject } from '../hooks/useKnitProject'
import { forgetProject } from '../lib/offline'
import { projectView } from '../lib/projectView'
import { OfflineNote } from '../components/OfflineNote'
import { BackLink } from '../components/BackLink'
import { Loading } from '../components/Loading'
import { StepPreparation } from '../components/StepPreparation'
import { ProjectTabs } from '../components/ProjectTabs'

export function KnittingProjectPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const knit = useKnitProject(api, id)
  const { project, loading, loadError, reload, offline, pending } = knit
  useYarnHue(projectHues(project?.yarns ?? []))
  const [params] = useSearchParams()
  // Préparation d'une étape (?etape=<id>, vide : l'étape en cours) ; sans paramètre, la vue du projet (trois onglets).
  // On tricote dans le mode tricoter (/tricot/:id/tricoter) ; ici, on prépare : texte, sections, diagrammes.
  const stepParam = params.get('etape')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const back = <BackLink to="/tricot">Tricot</BackLink>

  if (loadError) {
    return (
      <>
        {back}
        <LoadError message={loadError} onRetry={() => void reload()} />
      </>
    )
  }
  if (loading) return <Loading label="Chargement du projet" />
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

  const view = projectView(project)
  const knitTo = (stepId?: string) => `/tricot/${project.id}/tricoter${stepId ? `?etape=${encodeURIComponent(stepId)}` : ''}`
  const step = view.steps.find((s) => s.id === stepParam) ?? view.current
  const offlineNote = (
    <div className="mb-3 empty:hidden">
      <OfflineNote offline={offline} pending={pending} />
    </div>
  )

  if (stepParam !== null && step) {
    return <StepPreparation project={project} view={view} step={step} knit={knit} knitTo={knitTo} offlineNote={offlineNote} />
  }

  async function openPdf() {
    await openInNewTab(() => api.knitting.pdfUrl(project!.pdfPath!)).catch((error: unknown) => toast.error(errorMessage(error)))
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

  return (
    <>
      {back}
      <PageHeader
        title={project.title}
        titleDecoration={<span className="yarn-cord mt-1.5 w-32" data-testid="project-cord" aria-hidden />}
        description={`Taille ${view.size}`}
        titleAction={
          <div className="flex items-center gap-1">
            {project.patternId && (
              <Link to={`/tricot/patrons/${project.patternId}`} aria-label="Fiche du patron" className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative [&_svg]:size-5', TOUCH_AREA)}>
                <PatternsIcon />
              </Link>
            )}
            {project.pdfPath && (
              <ItemAction label="Voir le PDF" onClick={() => void openPdf()}>
                <PdfIcon />
              </ItemAction>
            )}
            <ItemAction label="Supprimer le projet" onClick={() => setConfirmDelete(true)}>
              <DeleteIcon />
            </ItemAction>
          </div>
        }
      />
      {offlineNote}
      <ProjectTabs project={project} view={view} knit={knit} knitTo={knitTo()} />
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

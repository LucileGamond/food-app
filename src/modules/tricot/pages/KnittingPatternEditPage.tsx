import { SearchX } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiContext'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { navState } from '@/lib/navState'
import { BackLink } from '../components/BackLink'
import { PatternForm } from '../components/PatternForm'

/** Ajout d'un patron à la bibliothèque (`/tricot/patrons/nouveau`) ou modification (`/tricot/patrons/:id/modifier`). */
export function KnittingPatternEditPage() {
  const { id } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  // Lien partagé depuis le téléphone (page /partage).
  const shared = navState(useLocation()).patternLink ?? null
  const existing = useAsync(() => (id ? api.knitting.getPattern(id) : Promise.resolve(null)), [api, id])

  const saved = (savedId: string) => {
    toast.success(id ? 'Patron enregistré' : 'Patron ajouté à la bibliothèque')
    navigate(`/tricot/patrons/${savedId}`, { replace: true })
  }

  const back = <BackLink to={id ? `/tricot/patrons/${id}` : '/tricot/patrons'}>{id ? 'Patron' : 'Bibliothèque'}</BackLink>
  if (existing.error) return <LoadError message={existing.error} onRetry={existing.reload} />
  if (existing.data === undefined) return <Skeleton className="h-64 max-w-lg rounded-2xl" aria-busy="true" aria-label="Chargement du patron" />
  if (id && existing.data === null)
    return (
      <>
        {back}
        <EmptyState icon={SearchX} title="Patron introuvable" description="Il a peut-être été supprimé." />
      </>
    )
  return (
    <>
      {back}
      <PageHeader title={existing.data ? 'Modifier le patron' : 'Ajouter un patron'} />
      <PatternForm existing={existing.data} initialLink={existing.data ? null : shared} onSaved={saved} />
    </>
  )
}

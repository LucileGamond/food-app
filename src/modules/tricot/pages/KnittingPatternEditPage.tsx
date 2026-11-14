import { SearchX } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useApi } from '@/app/ApiContext'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { useAsync } from '@/hooks/useAsync'
import { useLeaveWarning } from '@/hooks/useLeaveWarning'
import { navState } from '@/lib/navState'
import { BackLink } from '../components/BackLink'
import { PatternForm } from '../components/PatternForm'
import { Loading } from '../components/Loading'

/** Ajout d'un patron à la bibliothèque (`/tricot/patrons/nouveau`) ou modification (`/tricot/patrons/:id/modifier`). */
export function KnittingPatternEditPage() {
  const { id } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  // Lien partagé depuis le téléphone (page /partage).
  const shared = navState(useLocation()).patternLink ?? null
  const existing = useAsync(() => (id ? api.knitting.getPattern(id) : Promise.resolve(null)), [api, id])
  // Étiquettes proposées et doublons signalés ; sans elle, le formulaire marche quand même.
  const library = useAsync(() => api.knitting.listPatterns(), [api])
  const [changed, setChanged] = useState(false)
  useLeaveWarning(changed)

  const saved = (savedId: string) => {
    toast.success(id ? 'Patron enregistré' : 'Patron ajouté à la bibliothèque')
    navigate(`/tricot/patrons/${savedId}`, { replace: true })
  }

  const back = <BackLink to={id ? `/tricot/patrons/${id}` : '/tricot/patrons'} confirmLeave={changed}>{id ? 'Patron' : 'Bibliothèque'}</BackLink>
  if (existing.error) return <LoadError message={existing.error} onRetry={existing.reload} />
  if (existing.data === undefined) return <Loading label="Chargement du patron" />
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
      <PatternForm existing={existing.data} initialLink={existing.data ? null : shared} onSaved={saved} library={library.data ?? []} onChangedChange={setChanged} />
    </>
  )
}

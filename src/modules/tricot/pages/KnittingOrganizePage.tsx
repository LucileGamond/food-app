import { Navigate, useParams } from 'react-router-dom'

/** Ancienne adresse d'« Organiser » : la vue Organiser de l'onglet Préparer du projet. */
export function KnittingOrganizePage() {
  const { id = '' } = useParams()
  return <Navigate to={`/tricot/${id}?onglet=preparer&vue=organiser`} replace />
}

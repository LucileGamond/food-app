import { useApi } from '@/app/ApiContext'
import { useAsync } from '@/hooks/useAsync'
import { BackLink } from '../components/BackLink'
import { StashSection } from '../components/StashSection'

/** Stock de laine (`/tricot/laine`) : les pelotes, et pour chacune les patrons de la bibliothèque qui conviennent. */
export function KnittingStashPage() {
  const api = useApi()
  const patterns = useAsync(() => api.knitting.listPatterns(), [api])
  return (
    <>
      <BackLink to="/tricot">Tricot</BackLink>
      <StashSection patterns={patterns.data ?? []} />
    </>
  )
}

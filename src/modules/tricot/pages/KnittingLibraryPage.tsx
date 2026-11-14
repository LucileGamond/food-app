import { BookOpen, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { BackLink } from '../components/BackLink'
import { PatternList } from '../components/PatternList'
import { filterPatterns } from '../lib/library'

/** Bibliothèque de patrons : tous les patrons gardés, commencés ou non, à chercher et filtrer. */
export function KnittingLibraryPage() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listPatterns(), [api])
  const [search, setSearch] = useState('')

  const addLink = (
    <Link to="/tricot/patrons/nouveau" className={cn(buttonVariants(), 'h-10 px-4')}>
      <Plus /> Ajouter un patron
    </Link>
  )
  const shown = list.data ? filterPatterns(list.data, search) : []

  return (
    <>
      <BackLink to="/tricot">Tricot</BackLink>
      <PageHeader title="Bibliothèque de patrons" description="Tes patrons en PDF, photos ou lien, tricotés ou pas encore." actions={addLink} />
      {list.error ? (
        <LoadError message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des patrons">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucun patron" description="Garde ici les patrons qui te font envie : un PDF, des photos ou un lien." action={addLink} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" aria-label="Chercher un patron" placeholder="Chercher un patron" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length === 0 ? <p className="text-sm text-muted-foreground">Aucun patron ne correspond.</p> : <PatternList items={shown} />}
        </div>
      )}
    </>
  )
}

import { BookOpen, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { BackLink } from '../components/BackLink'
import { PatternList } from '../components/PatternList'
import { BatchPdfImport } from '../components/BatchPdfImport'
import { Loading } from '../components/Loading'
import { filterPatterns, libraryTags } from '../lib/library'

/** Bibliothèque de patrons : tous les patrons gardés, commencés ou non, à chercher et filtrer. */
export function KnittingLibraryPage() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listPatterns(), [api])
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const addLink = (
    <Link to="/tricot/patrons/nouveau" className={cn(buttonVariants(), 'h-10 px-4')}>
      <Plus /> Ajouter un patron
    </Link>
  )
  const actions = (
    <div className="flex flex-wrap gap-2">
      {addLink}
      <BatchPdfImport library={list.data ?? []} onDone={list.reload} />
    </div>
  )
  const tags = list.data ? libraryTags(list.data) : []
  // Étiquette retirée de tous les patrons entre-temps : plus de filtre.
  const activeTag = tag !== null && tags.includes(tag) ? tag : null
  const shown = list.data ? filterPatterns(list.data, search, activeTag) : []

  return (
    <>
      <BackLink to="/tricot">Tricot</BackLink>
      <PageHeader title="Bibliothèque de patrons" description="Tes patrons en PDF, photos ou lien, tricotés ou pas encore." actions={actions} />
      {list.error ? (
        <LoadError message={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading label="Chargement des patrons" />
      ) : list.data.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucun patron" description="Garde ici les patrons qui te font envie : un PDF, des photos ou un lien." action={actions} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" aria-label="Chercher un patron" placeholder="Chercher un patron" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {tags.length > 0 && (
            <div role="group" aria-label="Étiquettes" className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={activeTag === t}
                  onClick={() => setTag(activeTag === t ? null : t)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                    activeTag === t ? 'border-brand bg-brand/10 font-medium text-brand' : 'text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? <p className="text-sm text-muted-foreground">Aucun patron ne correspond.</p> : <PatternList items={shown} />}
        </div>
      )}
    </>
  )
}

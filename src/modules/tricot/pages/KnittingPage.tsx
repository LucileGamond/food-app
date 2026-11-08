import { ChevronRight, FilePlus2, Spool } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { FoldHeader } from '../components/FoldHeader'
import { QueueList } from '../components/QueueList'
import { StashSection } from '../components/StashSection'
import { MeasuresSection } from '../components/MeasuresSection'

/** Module Tricot : projets en cours (un patron suivi pour une taille), stock de laine et patrons à faire plus tard. */
export function KnittingPage() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listProjects(), [api])
  const projects = list.data ?? null
  const queue = useAsync(() => api.knitting.listQueue(), [api])
  // Patrons pour plus tard : repliés, la page reste centrée sur les projets en cours.
  const [queueOpen, setQueueOpen] = useState(false)
  const queueCount = queue.data?.length ?? 0

  const newLink = (
    <Link to="/tricot/nouveau" className={cn(buttonVariants(), 'h-10 px-4')}>
      <FilePlus2 /> Nouveau patron
    </Link>
  )

  return (
    <>
      <PageHeader title="Tricot" description="Patrons découpés en étapes pour ta taille, avec compteur de rangs. Rien que pour toi." actions={newLink} />
      {list.error ? (
        <LoadError message={list.error} onRetry={list.reload} />
      ) : projects === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des projets">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Spool} title="Aucun projet" description="Charge le PDF d’un patron et indique ta taille : il sera découpé en étapes à suivre." action={newLink} />
      ) : (
        <ul aria-label="Projets de tricot" className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/tricot/${p.id}`} className="flex items-center gap-3 rounded-2xl border bg-background p-4 shadow-xs transition-colors hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="text-sm text-muted-foreground">
                    Taille {p.size} · {p.stepsDone === p.stepsTotal ? 'terminé' : `${p.stepsDone} / ${p.stepsTotal} étapes`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <StashSection queue={queue.data ?? []} />
      <MeasuresSection />

      <section aria-labelledby="knit-queue" className="mt-8 space-y-3">
        <FoldHeader
          id="knit-queue"
          title="À faire plus tard"
          open={queueOpen}
          onToggle={() => setQueueOpen((o) => !o)}
          count={queueCount > 0 ? `${queueCount} patron${queueCount > 1 ? 's' : ''}` : null}
        />
        <div id="knit-queue-content" hidden={!queueOpen && queueCount > 0}>
          {queue.error ? (
            <LoadError message={queue.error} onRetry={queue.reload} />
          ) : !queue.data ? (
            <Skeleton className="h-16 rounded-2xl" aria-busy="true" aria-label="Chargement des patrons en attente" />
          ) : queue.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun patron en attente : choisis « Mettre de côté » dans « Nouveau patron ».</p>
          ) : (
            <QueueList items={queue.data} onChange={queue.reload} />
          )}
        </div>
      </section>
    </>
  )
}

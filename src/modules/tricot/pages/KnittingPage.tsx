import { ChevronRight, FilePlus2, RefreshCw, Spool } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { cn } from '@/lib/utils'
import type { KnitProjectSummary } from '../lib/pattern'

/** Module Tricot : projets en cours (un patron suivi pour une taille). */
export function KnittingPage() {
  const api = useApi()
  const [projects, setProjects] = useState<KnitProjectSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.knitting
      .listProjects()
      .then((list) => {
        if (!active) return
        setProjects(list)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [api, attempt])

  const newLink = (
    <Link to="/tricot/nouveau" className={cn(buttonVariants(), 'h-10 px-4')}>
      <FilePlus2 /> Nouveau patron
    </Link>
  )

  return (
    <>
      <PageHeader title="Tricot" description="Patrons découpés en étapes pour ta taille, avec compteur de rangs. Rien que pour toi." actions={newLink} />
      {loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{loadError}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
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
    </>
  )
}

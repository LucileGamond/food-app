import { BookOpen, ChevronRight, FilePlus2, Play, Plus, Spool } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { StashSection } from '../components/StashSection'
import { MeasuresSection } from '../components/MeasuresSection'
import type { KnitProjectSummary } from '../lib/pattern'
import { librarySummary, type KnitPattern } from '../lib/library'
import { describePass } from '../lib/passes'

/** « Taille M · étape 3 sur 8 : Manches », « Taille M · terminé ». */
function projectLine(p: KnitProjectSummary): string {
  if (!p.current) return `Taille ${p.size} · ${p.stepsTotal ? 'terminé' : 'aucune étape'}`
  return `Taille ${p.size} · étape ${p.current.number} sur ${p.stepsTotal} : ${p.current.title}`
}

/** « 12 / 40 rangs · 1re fois sur 2 ». */
function currentLine(c: NonNullable<KnitProjectSummary['current']>): string {
  return [`${c.rowCount}${c.totalRows !== null ? ` / ${c.totalRows}` : ''} rang${(c.totalRows ?? c.rowCount) > 1 ? 's' : ''}`, describePass(c)].filter(Boolean).join(' · ')
}

/** Module Tricot : projets en cours (un patron suivi pour une taille), bibliothèque de patrons, stock de laine et mesures. */
export function KnittingPage() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listProjects(), [api])
  const projects = list.data ?? null
  const patterns = useAsync(() => api.knitting.listPatterns(), [api])

  const newLink = (
    <Link to="/tricot/nouveau" className={cn(buttonVariants(), 'h-10 px-4')}>
      <FilePlus2 /> Nouveau projet
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
            <li key={p.id} className="flex items-center gap-2 rounded-2xl border bg-background shadow-xs transition-colors hover:bg-muted/50">
              <Link to={`/tricot/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{projectLine(p)}</span>
                  {p.current && <span className="block truncate text-xs text-muted-foreground tabular-nums">{currentLine(p.current)}</span>}
                </span>
                {!p.current && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </Link>
              {p.current && (
                <Link to={`/tricot/${p.id}/tricoter`} aria-label={`Tricoter « ${p.title} »`} className={cn(buttonVariants({ size: 'icon-lg' }), 'mr-3 shrink-0')}>
                  <Play />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <LibraryLink patterns={patterns.data} />
      <StashSection patterns={patterns.data ?? []} />
      <MeasuresSection />
    </>
  )
}

/** Accès à la bibliothèque de patrons, avec ce qu'elle contient et de quoi en ajouter un sans la traverser. */
function LibraryLink({ patterns }: { patterns: KnitPattern[] | undefined }) {
  const summary = patterns === undefined ? null : patterns.length === 0 ? 'Garde ici les patrons qui te font envie' : librarySummary(patterns)
  return (
    <div className="mt-8 flex items-center gap-2 rounded-2xl border bg-background shadow-xs transition-colors hover:bg-muted/50">
      <Link to="/tricot/patrons" className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <BookOpen className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Bibliothèque de patrons</span>
          {summary && <span className="block truncate text-sm text-muted-foreground">{summary}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      {/* Mettre un patron de côté sans passer par la bibliothèque. */}
      <Link to="/tricot/patrons/nouveau" aria-label="Ajouter un patron" className={cn(buttonVariants({ variant: 'outline' }), 'mr-3 h-10 shrink-0')}>
        <Plus /> Ajouter
      </Link>
    </div>
  )
}

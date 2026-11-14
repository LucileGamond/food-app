import { BookOpen, ChevronRight, Play, Plus, Ruler, Spool, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { Fold } from '../components/Fold'
import { Loading } from '../components/Loading'
import type { KnitProjectSummary } from '../lib/pattern'
import { librarySummary } from '../lib/library'
import { describePass } from '../lib/passes'

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « Étape 3 sur 8 · 12 / 40 rangs · 1re fois sur 2 » : où en est le projet, sur une ligne. */
export function projectProgress(p: KnitProjectSummary): string {
  if (!p.current) return p.stepsTotal ? 'Terminé' : 'Aucune étape'
  const c = p.current
  const rows = `${c.rowCount}${c.totalRows !== null ? ` / ${c.totalRows}` : ''} rang${(c.totalRows ?? c.rowCount) > 1 ? 's' : ''}`
  return [`Étape ${c.number} sur ${p.stepsTotal}`, rows, describePass(c)].filter(Boolean).join(' · ')
}

const ROW = 'flex items-center gap-2 rounded-xl border bg-background shadow-xs transition-colors hover:bg-muted/50'
const ROW_LINK = 'flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/** Une ligne de projet : le nom, où il en est, et Tricoter d'un toucher quand il est en cours. */
function ProjectRow({ p }: { p: KnitProjectSummary }) {
  return (
    <li className="flex items-center gap-2">
      <Link to={`/tricot/${p.id}`} className={cn(ROW_LINK, '-mx-1 px-1 hover:bg-muted/50')}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.title}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{projectProgress(p)}</span>
        </span>
        {!p.current && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </Link>
      {p.current && (
        <Link to={`/tricot/${p.id}/tricoter`} aria-label={`Tricoter « ${p.title} »`} className={cn(buttonVariants({ size: 'icon-touch' }), 'shrink-0')}>
          <Play />
        </Link>
      )}
    </li>
  )
}

/** Une entrée vers une page du module : même dessin pour les trois. */
function Entry({ to, icon: Icon, title, summary }: { to: string; icon: LucideIcon; title: string; summary: string | null }) {
  return (
    <li className={ROW}>
      <Link to={to} className={ROW_LINK}>
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {summary && <span className="block truncate text-xs text-muted-foreground">{summary}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  )
}

/**
 * Accueil du module Tricot : les projets en cours, compacts, avec « + » pour en commencer un (ce qui se passe est
 * expliqué sur l'écran Nouveau projet) ; puis la bibliothèque, le stock de laine et les mesures, chacun sur sa page.
 */
export function KnittingPage() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listProjects(), [api])
  const patterns = useAsync(() => api.knitting.listPatterns(), [api])
  const stash = useAsync(() => api.knitting.listStash(), [api])
  const measures = useAsync(() => api.knitting.listMeasures(), [api])

  const projects = list.data ?? null
  const ongoing = projects?.filter((p) => p.current) ?? []
  const finished = projects?.filter((p) => !p.current) ?? []

  return (
    <>
      <PageHeader title="Tricot" />
      {/* Un bloc arrondi, déplié par défaut : un trait entre les projets, et avant les projets terminés. */}
      <Fold
        id="knit-ongoing"
        title="Projets en cours"
        defaultOpen
        summary={projects === null ? null : ongoing.length === 0 ? 'aucun' : plural(ongoing.length, 'projet')}
        action={
          <Link to="/tricot/nouveau" aria-label="Nouveau projet" className={buttonVariants({ variant: 'outline', size: 'icon-touch' })}>
            <Plus />
          </Link>
        }
      >
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : projects === null ? (
          <Loading label="Chargement des projets" />
        ) : (
          <div className="divide-y">
            {ongoing.length === 0 ? (
              <p className="pb-3 text-sm text-muted-foreground">Aucun projet en cours.</p>
            ) : (
              <ul aria-label="Projets en cours" className="divide-y">
                {ongoing.map((p) => (
                  <ProjectRow key={p.id} p={p} />
                ))}
              </ul>
            )}
            {finished.length > 0 && (
              <div className="pt-2">
                <Fold id="knit-finished" variant="sub" title={`Terminés (${finished.length})`}>
                  <ul aria-label="Projets terminés" className="divide-y">
                    {finished.map((p) => (
                      <ProjectRow key={p.id} p={p} />
                    ))}
                  </ul>
                </Fold>
              </div>
            )}
          </div>
        )}
      </Fold>

      <nav aria-label="Le reste du tricot" className="mt-8">
        <ul className="space-y-2">
          <Entry
            to="/tricot/patrons"
            icon={BookOpen}
            title="Bibliothèque de patrons"
            summary={patterns.data === undefined ? null : patterns.data.length === 0 ? 'aucun patron' : librarySummary(patterns.data)}
          />
          <Entry to="/tricot/laine" icon={Spool} title="Stock de laine" summary={stash.data === undefined ? null : stash.data.length === 0 ? 'vide' : plural(stash.data.length, 'laine')} />
          <Entry to="/tricot/mesures" icon={Ruler} title="Fiches de mesures" summary={measures.data === undefined ? null : measures.data.length === 0 ? 'aucune' : plural(measures.data.length, 'fiche')} />
        </ul>
      </nav>
    </>
  )
}

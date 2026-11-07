import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import type { IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SourceForm } from '../components/SourceForm'
import { SourceList } from '../components/SourceList'
import { useAgendaScope, useAgendaToday, useCalendarSources } from '../hooks/useAgenda'

/** Agendas Google suivis par le foyer : les ajouter (adresse iCal secrète), voir leur synchronisation, les retirer. */
export function AgendaSourcesPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useAgendaToday(fixedToday)
  const { viewerId } = useAgendaScope()
  const { sources, error, reload, busy, add, remove, sync } = useCalendarSources()

  return (
    <>
      <PageHeader
        title="Agendas suivis"
        description="Synchronisés toutes les 15 minutes, en lecture seule."
        actions={
          <>
            <Link to="/agenda" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
              <ArrowLeft /> Agenda
            </Link>
            {sources && sources.length > 0 && (
              <Button variant="outline" className="h-10" disabled={busy} onClick={() => void sync()}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                Synchroniser
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {error ? (
          <LoadError message={error} onRetry={reload} />
        ) : !sources ? (
          <Skeleton className="h-24 w-full" aria-busy="true" aria-label="Chargement des agendas" />
        ) : sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun agenda suivi pour l’instant.</p>
        ) : (
          <SourceList sources={sources} viewerId={viewerId} today={today} onRemove={remove} />
        )}
        <SourceForm busy={busy} onAdd={add} />
      </div>
    </>
  )
}

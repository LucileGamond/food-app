import { CalendarPlus, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { useSettings } from '@/app/SettingsContext'
import { addDays, formatRange, nextDays, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { AgendaDay } from '../components/AgendaDay'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { useAgendaEvents, useAgendaScope, useAgendaToday } from '../hooks/useAgenda'
import { useWeekExtras } from '../hooks/useWeekExtras'
import { eventsByDay, eventsInScope } from '../lib/agenda'

const WEEK = 7

/** Agenda de la semaine (7 jours glissants) : rendez-vous des agendas affichés, repas et arrosages prévus. */
export function AgendaPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useAgendaToday(fixedToday)
  const [weekOffset, setWeekOffset] = useState(0)
  const start = addDays(today, weekOffset * WEEK)
  const end = addDays(start, WEEK - 1)
  const { scope, setScope, viewerId, otherName, ready } = useAgendaScope()
  const { isEnabled } = useSettings()
  const { events, sources, error, reload } = useAgendaEvents(start, end)
  const extrasOf = useWeekExtras(start, today, { meals: ready && isEnabled('planning'), waterings: ready && isEnabled('plantes') })

  return (
    <>
      <PageHeader
        title="Agenda"
        description={formatRange(start, WEEK)}
        actions={
          <Link to="/agenda/sources" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            <Settings2 /> Agendas suivis
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ScopeSwitch value={scope} otherName={otherName} onChange={setScope} disabled={!ready} className="w-full sm:w-auto" />
        <nav aria-label="Semaines" className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-10" aria-label="Semaine précédente" onClick={() => setWeekOffset((n) => n - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" className="h-10" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>
            Aujourd’hui
          </Button>
          <Button variant="outline" size="icon" className="size-10" aria-label="Semaine suivante" onClick={() => setWeekOffset((n) => n + 1)}>
            <ChevronRight />
          </Button>
        </nav>
      </div>

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !events || !sources ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement de l’agenda">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Aucun agenda suivi"
          description="Ajoute ton agenda Google (son adresse secrète au format iCal) : ses rendez-vous apparaîtront ici et sur l’accueil."
          action={
            <Link to="/agenda/sources" className={cn(buttonVariants(), 'h-10')}>
              Ajouter un agenda
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {eventsByDay(eventsInScope(events, viewerId, scope), nextDays(start, WEEK)).map(({ day, events: dayEvents }) => (
            <AgendaDay key={day} day={day} today={today} events={dayEvents} extras={extrasOf(day)} viewerId={viewerId} showOwner={scope !== 'mine'} />
          ))}
        </div>
      )}
    </>
  )
}

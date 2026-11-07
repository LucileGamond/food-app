import { CalendarPlus, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { useSettings } from '@/app/SettingsContext'
import { formatRange, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { AgendaDay } from '../components/AgendaDay'
import { MonthGrid } from '../components/MonthGrid'
import { ScopeSwitch } from '../components/ScopeSwitch'
import { useAgendaEvents, useAgendaScope, useAgendaToday } from '../hooks/useAgenda'
import { useAgendaPeriod } from '../hooks/useAgendaPeriod'
import { useDayExtras } from '../hooks/useDayExtras'
import { eventsByDay, eventsInScope, type AgendaEvent } from '../lib/agenda'
import { formatMonth, type AgendaView } from '../lib/calendar'

const STEP_LABELS: Record<AgendaView, [string, string]> = { semaine: ['Semaine précédente', 'Semaine suivante'], mois: ['Mois précédent', 'Mois suivant'] }

/**
 * Agenda de la semaine (lundi → dimanche) ou du mois (grille, puis le jour choisi) : rendez-vous des agendas
 * affichés, repas et arrosages prévus.
 */
export function AgendaPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useAgendaToday(fixedToday)
  const { view, selected, period, setView, select, move, goToday } = useAgendaPeriod(today)
  const { scope, setScope, viewerId, otherName, ready } = useAgendaScope()
  const { isEnabled } = useSettings()
  const { events, sources, error, reload } = useAgendaEvents(period.from, period.to)
  const extrasOf = useDayExtras(period.from, period.to, today, { meals: ready && isEnabled('planning'), waterings: ready && isEnabled('plantes') })
  const visible = eventsInScope(events ?? [], viewerId, scope)
  const [previous, next] = STEP_LABELS[view]

  const renderDay = (d: IsoDate, dayEvents: AgendaEvent[]) => (
    <AgendaDay key={d} day={d} today={today} events={dayEvents} extras={extrasOf(d)} viewerId={viewerId} showOwner={scope !== 'mine'} />
  )

  return (
    <>
      <PageHeader
        title="Agenda"
        description={view === 'semaine' ? formatRange(period.from, 7) : formatMonth(selected)}
        actions={
          <Link to="/agenda/sources" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            <Settings2 /> Agendas suivis
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ScopeSwitch value={scope} otherName={otherName} onChange={setScope} disabled={!ready} className="w-full sm:w-auto" />
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          <Tabs value={view} onValueChange={(value) => setView(value as AgendaView)}>
            <TabsList className="h-10">
              <TabsTrigger value="semaine" className="px-3">
                Semaine
              </TabsTrigger>
              <TabsTrigger value="mois" className="px-3">
                Mois
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <nav aria-label="Période" className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-10" aria-label={previous} onClick={() => move(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" className="h-10" disabled={selected === today} onClick={goToday}>
              Aujourd’hui
            </Button>
            <Button variant="outline" size="icon" className="size-10" aria-label={next} onClick={() => move(1)}>
              <ChevronRight />
            </Button>
          </nav>
        </div>
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
      ) : view === 'semaine' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{eventsByDay(visible, period.days).map(({ day, events: dayEvents }) => renderDay(day, dayEvents))}</div>
      ) : (
        <div className="space-y-3">
          <MonthGrid days={period.days} selected={selected} today={today} events={visible} viewerId={viewerId} onSelect={select} />
          {eventsByDay(visible, [selected]).map(({ day, events: dayEvents }) => renderDay(day, dayEvents))}
        </div>
      )}
    </>
  )
}

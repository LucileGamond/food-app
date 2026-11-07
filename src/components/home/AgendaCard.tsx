import { HomeCard, Loading } from '@/components/home/HomeCards'
import type { IsoDate } from '@/lib/dates'
import { EventItem } from '@/modules/agenda/components/EventItem'
import { ScopeSwitch } from '@/modules/agenda/components/ScopeSwitch'
import { useAgendaEvents, useAgendaScope } from '@/modules/agenda/hooks/useAgenda'
import { eventsByDay, eventsInScope } from '@/modules/agenda/lib/agenda'

const MAX_EVENTS = 5

/** Rendez-vous du jour, de mon agenda, de celui de l'autre ou des deux. */
export function AgendaCard({ today }: { today: IsoDate }) {
  const { scope, setScope, viewerId, otherName, ready } = useAgendaScope()
  const { events, sources, error } = useAgendaEvents(today, today)
  const [{ events: todayEvents }] = eventsByDay(eventsInScope(events ?? [], viewerId, scope), [today])
  return (
    <HomeCard id="home-agenda" title="Rendez-vous" to={sources?.length === 0 ? '/agenda/sources' : '/agenda'} linkLabel={sources?.length === 0 ? 'Ajouter' : 'Semaine'}>
      <ScopeSwitch value={scope} otherName={otherName} onChange={setScope} disabled={!ready} className="w-full" />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !events || !sources ? (
        <Loading label="Chargement des rendez-vous" />
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun agenda suivi : ajoute ton agenda Google pour voir tes rendez-vous ici.</p>
      ) : todayEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun rendez-vous aujourd’hui.</p>
      ) : (
        <ul aria-label="Rendez-vous du jour" className="divide-y">
          {todayEvents.slice(0, MAX_EVENTS).map((event) => (
            <EventItem key={event.id} event={event} day={today} viewerId={viewerId} showOwner={scope !== 'mine'} />
          ))}
          {todayEvents.length > MAX_EVENTS && <li className="pt-2 text-sm text-muted-foreground">et {todayEvents.length - MAX_EVENTS} autre{todayEvents.length - MAX_EVENTS > 1 ? 's' : ''}</li>}
        </ul>
      )}
    </HomeCard>
  )
}

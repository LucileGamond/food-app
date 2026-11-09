// Résumé du matin (module Agenda) : les rendez-vous du jour de chacun, selon les agendas qu'il affiche.
// À qui (page affichée, notifications non coupées, une fois par jour dès 7 h) : la base (claim_agenda_reminders).

import { formatOccurrenceTime } from '../_shared/agenda/format.ts'
import { AGENDA_TIME_ZONE, occurrencesOn, type CalendarOccurrence } from '../_shared/agenda/occurrence.ts'
import { inScope, type AgendaScope } from '../_shared/agenda/scope.ts'
import { toCivilDate, type CivilDate } from '../_shared/watering/civil-date.ts'
import { sendToProfiles, type RunReport, type SendDeps } from './handler.ts'
import type { PushPayload } from './message.ts'

export interface AgendaRecipient {
  profileId: string
  scope: AgendaScope
}

/** Occurrence d'un agenda, avec son propriétaire. */
export type AgendaEntry = CalendarOccurrence & { ownerId: string; ownerName: string }

export interface AgendaNotifyDeps extends SendDeps {
  now: () => number
  /** Personnes à prévenir aujourd'hui, réservées (une seule exécution les prévient). */
  claimAgendaReminders: () => Promise<AgendaRecipient[]>
  /** Occurrences qui touchent ce jour (tous les agendas). */
  loadAgendaDay: (day: CivilDate) => Promise<AgendaEntry[]>
}

const MAX_LINES = 4

/** « 9 h – 10 h Dentiste », suivi du prénom quand l'agenda n'est pas le sien. */
function line(entry: AgendaEntry, day: CivilDate, viewerId: string): string {
  const owner = entry.ownerId === viewerId ? '' : ` (${entry.ownerName})`
  return `${formatOccurrenceTime(entry, day)} ${entry.title}${owner}`
}

/** Notification du jour, ou null s'il n'y a rien dans les agendas affichés. */
export function buildAgendaMessage(entries: AgendaEntry[], day: CivilDate, recipient: AgendaRecipient): PushPayload | null {
  const visible = occurrencesOn(
    entries.filter((e) => inScope(e.ownerId, recipient.profileId, recipient.scope)),
    day,
    AGENDA_TIME_ZONE,
  )
  if (visible.length === 0) return null
  const others = visible.length - MAX_LINES
  return {
    title: visible.length === 1 ? 'Aujourd’hui : 1 rendez-vous 📅' : `Aujourd’hui : ${visible.length} rendez-vous 📅`,
    body:
      visible
        .slice(0, MAX_LINES)
        .map((e) => line(e, day, recipient.profileId))
        .join('\n') + (others > 0 ? `\net ${others} autre${others > 1 ? 's' : ''}` : ''),
    url: '/agenda',
    tag: `agenda-${day}`,
  }
}

export async function notifyAgenda(deps: AgendaNotifyDeps): Promise<RunReport> {
  // Lecture d'abord : si elle échoue, personne n'est réservé et le résumé repart au passage suivant (une heure après).
  const day = toCivilDate(new Date(deps.now()), AGENDA_TIME_ZONE)
  const entries = await deps.loadAgendaDay(day)
  const recipients = await deps.claimAgendaReminders()
  // Rien de prévu : la personne est quand même notée comme prévenue (un rendez-vous ajouté dans la journée ne réveille pas).
  const messages = recipients.flatMap((recipient) => {
    const payload = buildAgendaMessage(entries, day, recipient)
    return payload ? [{ profileId: recipient.profileId, payload }] : []
  })
  return sendToProfiles(deps, messages)
}

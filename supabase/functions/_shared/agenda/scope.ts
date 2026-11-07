// Agendas affichés (accueil, page Agenda, résumé du matin) : les miens, ceux de l'autre, ou les deux.

export const AGENDA_SCOPES = ['mine', 'other', 'all'] as const
export type AgendaScope = (typeof AGENDA_SCOPES)[number]

export function isAgendaScope(value: unknown): value is AgendaScope {
  return typeof value === 'string' && (AGENDA_SCOPES as readonly string[]).includes(value)
}

/** L'agenda de `ownerId` est-il affiché pour `viewerId` ? */
export function inScope(ownerId: string, viewerId: string, scope: AgendaScope): boolean {
  if (scope === 'all') return true
  return scope === 'mine' ? ownerId === viewerId : ownerId !== viewerId
}

// Rappels « pense à boire » (suivi d'hydratation), envoyés par la même fonction que les notifications de courses.
// Qui rappeler et quand : calculé par la base (claim_hydration_reminders), ici seulement le texte et l'envoi.

import type { PushPayload } from './message.ts'

export interface HydrationReminder {
  profile_id: string
  drunk_ml: number
  goal_ml: number
}

/** 1500 → « 1,5 L », 200 → « 0,2 L ». */
export function liters(ml: number): string {
  return `${(Math.round(ml / 100) / 10).toLocaleString('fr-FR')} L`
}

export function buildHydrationMessage(reminder: HydrationReminder): PushPayload {
  return {
    title: 'Pense à boire 💧',
    body:
      reminder.drunk_ml === 0
        ? `Rien bu depuis ce matin : un verre d’eau ? Objectif ${liters(reminder.goal_ml)}.`
        : `4 h sans boire. ${liters(reminder.drunk_ml)} sur ${liters(reminder.goal_ml)} aujourd’hui.`,
    url: '/hydratation',
    tag: 'hydration',
  }
}

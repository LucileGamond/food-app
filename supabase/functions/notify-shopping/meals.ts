// Rappel du soir : journal végé à remplir (page Végé) et plan alimentaire vide aujourd'hui (page Plan).
// À qui (page affichée, rappel non coupé, une fois par jour dès 21 h, quelque chose à remplir) : la base
// (claim_meal_reminders).

import { toCivilDate, type CivilDate } from '../_shared/watering/civil-date.ts'
import { sendToProfiles, type RunReport, type SendDeps } from './handler.ts'
import type { PushPayload } from './message.ts'

export interface MealReminder {
  profileId: string
  /** Moments du journal sans réponse aujourd'hui (0 à 3). */
  missing: number
  /** Une période du plan est en cours et rien n'y est noté aujourd'hui. */
  planEmpty: boolean
}

export interface MealsNotifyDeps extends SendDeps {
  now: () => number
  /** Personnes à rappeler ce soir, réservées (une seule exécution les rappelle). */
  claimMealReminders: () => Promise<MealReminder[]>
}

/** Notification du soir, ou null s'il n'y a rien à remplir. */
export function buildMealsMessage(reminder: MealReminder, day: CivilDate): PushPayload | null {
  const lines: string[] = []
  if (reminder.missing === 3) lines.push('Végé ou non ? Note tes repas du jour.')
  else if (reminder.missing > 0) lines.push(`Végé ou non ? ${reminder.missing === 1 ? 'Il reste 1 repas' : `Il reste ${reminder.missing} repas`} à noter.`)
  if (reminder.planEmpty) lines.push('Rien de noté dans ton plan alimentaire aujourd’hui.')
  if (lines.length === 0) return null
  return {
    title: 'Tes repas du jour 🥗',
    body: lines.join('\n'),
    // Le journal d'abord : c'est lui qui est le plus souvent à remplir.
    url: reminder.missing > 0 ? `/vege?profil=${reminder.profileId}` : `/plan?profil=${reminder.profileId}&jour=${day}`,
    tag: `repas-${day}`,
  }
}

export async function notifyMeals(deps: MealsNotifyDeps): Promise<RunReport> {
  const day = toCivilDate(new Date(deps.now()), 'Europe/Paris')
  const messages = (await deps.claimMealReminders()).flatMap((reminder) => {
    const payload = buildMealsMessage(reminder, day)
    return payload ? [{ profileId: reminder.profileId, payload }] : []
  })
  return sendToProfiles(deps, messages)
}

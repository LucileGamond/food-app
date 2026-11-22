import { Flame } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { SlotButtons } from '@/components/food/MealLogCard'
import { HomeCard } from '@/components/home/HomeCards'
import { useMealLog } from '@/hooks/useMealLog'
import { useMealSuggestions } from '@/hooks/useMealSuggestions'
import { addDays, currentHour, formatShortDate, type IsoDate } from '@/lib/dates'
import { dayLog, isComplete, LOG_SLOTS, missingDays, streak } from '@/lib/mealLog'

/** Jours chargés : assez pour savoir si la personne a déjà commencé son journal (le rappel regarde 7 jours). */
const REMINDER_LOAD_DAYS = 60

/**
 * Journal des repas sur l'accueil, en une ligne : végé, non végé ou pas de repas pour le petit-déjeuner, le midi et
 * le soir d'aujourd'hui, et les jours passés à rattraper. Tout est rempli : pas de carte.
 */
export function MealLogReminder({ today, hour = currentHour() }: { today: IsoDate; hour?: number }) {
  const api = useApi()
  const { currentProfile } = useAuth()
  const profileId = currentProfile?.id ?? null
  const { entries, loading, loadError, answer } = useMealLog(api, profileId, addDays(today, -REMINDER_LOAD_DAYS), today)
  const suggestions = useMealSuggestions(api, profileId, today)
  if (!profileId || loading || loadError) return null
  const log = dayLog(entries, profileId, today)
  const late = missingDays(entries, profileId, today, hour).filter((d) => d !== today)
  if (isComplete(log) && late.length === 0) return null
  const oldest = late.at(-1)
  const days = streak(entries, profileId, today)
  return (
    <HomeCard
      id="home-meal-log"
      title="Végé ou non ?"
      aside={
        days > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-200" title="Jours complets d’affilée">
            <Flame className="size-3.5" aria-hidden />
            {days}
          </span>
        )
      }
      to={`/vege?profil=${profileId}`}
      linkLabel="Stats"
    >
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-2">
        {LOG_SLOTS.map((slot) => (
          <div key={slot.value} className="flex flex-col items-start gap-1">
            <span className="text-xs text-muted-foreground">{slot.label}</span>
            <SlotButtons small label={slot.label} answer={log[slot.value]} suggested={suggestions[slot.value]} onAnswer={(kind) => void answer(today, slot.value, kind)} />
          </div>
        ))}
      </div>
      {oldest && (
        <Link to={`/vege?profil=${profileId}`} className="block text-sm font-medium text-brand underline-offset-4 hover:underline">
          {late.length === 1 ? `1 jour à rattraper (${formatShortDate(oldest)})` : `${late.length} jours à rattraper depuis le ${formatShortDate(oldest)}`}
        </Link>
      )}
    </HomeCard>
  )
}

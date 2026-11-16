import { ChevronRight, Leaf } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useMealLog } from '@/hooks/useMealLog'
import { addDays, currentHour, formatShortDate, type IsoDate } from '@/lib/dates'
import { missingDays } from '@/lib/mealLog'

/** Jours chargés : assez pour savoir si la personne a déjà commencé son journal (le rappel regarde 7 jours). */
const REMINDER_LOAD_DAYS = 60

/** Bandeau de l'accueil tant que des jours du journal des repas restent à remplir (le plus ancien d'abord). */
export function MealLogReminder({ today, hour = currentHour() }: { today: IsoDate; hour?: number }) {
  const api = useApi()
  const { currentProfile } = useAuth()
  const profileId = currentProfile?.id ?? null
  const { entries, loading, loadError } = useMealLog(api, profileId, addDays(today, -REMINDER_LOAD_DAYS), today)
  if (!profileId || loading || loadError) return null
  const days = missingDays(entries, profileId, today, hour)
  if (days.length === 0) return null
  const oldest = days.at(-1)!
  return (
    <Link
      to={`/plan?profil=${profileId}&jour=${oldest}`}
      className="mb-4 flex items-center gap-3 rounded-2xl border border-brand/25 bg-brand/5 p-4 text-sm hover:bg-brand/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Leaf className="size-5 shrink-0 text-brand" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium">
          {days.length === 1 ? (oldest === today ? 'Repas d’aujourd’hui à remplir' : '1 jour de repas à remplir') : `${days.length} jours de repas à remplir`}
        </span>{' '}
        <span className="text-muted-foreground">{days.length > 1 || oldest !== today ? `depuis le ${formatShortDate(oldest)}` : 'végé ou non ?'}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { DayLogRow, MealLogCard, MealLogStats } from '@/components/food/MealLogCard'
import { ProfileSwitch, useProfileParam } from '@/components/food/ProfileSwitch'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useMealLog } from '@/hooks/useMealLog'
import { useMealSuggestionsRange } from '@/hooks/useMealSuggestions'
import { useToday } from '@/hooks/useToday'
import { formatDay, formatShortDate, type IsoDate } from '@/lib/dates'
import { dayLog, daysToFill, logRangeStart, streak, weekDays, weeklyStats } from '@/lib/mealLog'

/**
 * Journal végé, indépendant du plan alimentaire : les repas du jour, les jours passés à rattraper (comme sur l'accueil),
 * puis la part de repas végés par semaine ; toucher une semaine affiche ses jours pour les corriger.
 */
export function VegePage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useToday(fixedToday)
  const api = useApi()
  const { profiles } = useAuth()
  const [profile, selectProfile] = useProfileParam()
  const profileId = profile?.id ?? null
  const from = logRangeStart(today)
  const mealLog = useMealLog(api, profileId, from, today)
  const suggestions = useMealSuggestionsRange(api, profileId, from, today)
  const [week, setWeek] = useState<IsoDate | null>(null)

  const row = (date: IsoDate) =>
    profileId && (
      <DayLogRow
        label={date === today ? `Aujourd’hui, ${formatDay(date).toLowerCase()}` : formatDay(date)}
        log={dayLog(mealLog.entries, profileId, date)}
        suggestions={suggestions(date)}
        onAnswer={(slot, kind) => void mealLog.answer(date, slot, kind)}
      />
    )

  let content
  if (mealLog.loadError) content = <LoadError message={mealLog.loadError} onRetry={() => void mealLog.reload()} />
  else if (mealLog.loading || !profileId)
    content = (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement du journal">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  else {
    const late = daysToFill(mealLog.entries, profileId, today, from)
    content = (
      <div className="space-y-4">
        <MealLogCard
          log={dayLog(mealLog.entries, profileId, today)}
          suggestions={suggestions(today)}
          streak={streak(mealLog.entries, profileId, today)}
          onAnswer={(slot, kind) => void mealLog.answer(today, slot, kind)}
        />

        <section aria-labelledby="late-days-title" className="rounded-2xl border bg-background p-4 shadow-xs">
          <h2 id="late-days-title" className="font-semibold tracking-tight">
            À rattraper
          </h2>
          {late.length === 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              {mealLog.entries.some((e) => e.profile_id === profileId) ? 'Tous les jours passés sont remplis.' : 'Les jours oubliés apparaîtront ici.'}
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {late.length === 1 ? '1 jour à remplir.' : `${late.length} jours à remplir, depuis le ${formatShortDate(late.at(-1)!)}.`}
              </p>
              <ul className="mt-3 divide-y">
                {late.map((date) => (
                  <li key={date} className="py-3 first:pt-0 last:pb-0">
                    {row(date)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <MealLogStats weeks={weeklyStats(mealLog.entries, profileId, today)} selected={week} onSelect={setWeek}>
          {week && (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-sm font-semibold tracking-tight">Semaine du {formatShortDate(week)}</h3>
              <ul className="mt-2 divide-y">
                {weekDays(week, today).map((date) => (
                  <li key={date} className="py-3 last:pb-0">
                    {row(date)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </MealLogStats>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Végé" description={profile ? `Repas végés ou non de ${profile.display_name}` : 'Repas végés ou non'} />
      <div className="mb-4">
        <ProfileSwitch profiles={profiles} value={profileId} onChange={selectProfile} />
      </div>
      {content}
    </>
  )
}

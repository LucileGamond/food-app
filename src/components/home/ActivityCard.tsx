// Carte « Ce que l'autre a fait » de l'accueil : derniers gestes des autres (arrosages, repas, recettes, courses).

import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { useAsync } from '@/hooks/useAsync'
import { useNow } from '@/hooks/useNow'
import { useRealtimeReload } from '@/hooks/useRealtimeReload'
import { ACTIVITY_DAYS, activityLines, formatAgo } from '@/lib/activity'
import { todayIso } from '@/lib/dates'
import { HomeCard, Loading } from './HomeCards'

/** Lignes affichées au plus. */
const MAX_LINES = 6

export function ActivityCard({ now: fixedNow }: { now?: Date }) {
  const api = useApi()
  const { isEnabled } = useSettings()
  const { data, error, reload } = useAsync(() => api.activity.listRecent(), [api])
  useRealtimeReload(api.activity.subscribe, reload)
  const now = useNow(fixedNow)
  const lines = data ? activityLines(data, isEnabled, todayIso(now)).slice(0, MAX_LINES) : []

  return (
    <HomeCard id="home-activity" title="Ce que l’autre a fait">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !data ? (
        <Loading label="Chargement des nouvelles de l’autre" />
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien de nouveau depuis {ACTIVITY_DAYS} jours.</p>
      ) : (
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.key} className="flex items-baseline gap-3 py-2 text-sm first:pt-0 last:pb-0">
              <Link to={line.to} className="min-w-0 flex-1 hover:underline">
                <span className="font-medium">{line.actorName}</span> {line.text}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">{formatAgo(line.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  )
}

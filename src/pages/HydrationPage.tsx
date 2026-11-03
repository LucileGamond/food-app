import { BellRing, GlassWater, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { useHydration } from '@/hooks/useHydration'
import { useToday } from '@/hooks/useToday'
import type { IsoDate } from '@/lib/dates'
import { formatCl, formatElapsed, formatLiters, formatTime, GLASSES, lastDrink, nextReminder, totalMl } from '@/lib/hydration'

/** Heure courante, rafraîchie chaque minute (« il y a 2 h 10 »). `fixed` (tests) l'impose. */
function useNow(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date())
  useEffect(() => {
    if (fixed) return
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [fixed])
  return fixed ?? now
}

export function HydrationPage({ today: fixedToday, now: fixedNow }: { today?: IsoDate; now?: Date }) {
  const today = useToday(fixedToday)
  const now = useNow(fixedNow)
  const api = useApi()
  const { settings, notifications } = useSettings()
  const hydration = useHydration(api, today)
  const [adding, setAdding] = useState(false)

  const goal = settings.hydrationGoalMl
  const total = totalMl(hydration.intakes)
  const percent = Math.min(100, Math.round((total / goal) * 100))
  const last = lastDrink(hydration.intakes)
  const reminder = nextReminder(hydration.intakes, goal, now)
  const remindersOn = notifications.status === 'on' && !settings.mutedNotifications.includes('hydratation')

  async function drink(volumeMl: number) {
    setAdding(true)
    await hydration.add(volumeMl)
    setAdding(false)
  }

  return (
    <>
      <PageHeader title="Eau" description={`Objectif : ${formatLiters(goal)} par jour · rien que pour toi`} />

      {hydration.loadError ? (
        <LoadError message={hydration.loadError} onRetry={() => void hydration.reload()} />
      ) : hydration.loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des verres du jour">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-label="Aujourd’hui" className="rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatLiters(total)}</span>
              <span className="text-sm text-muted-foreground">sur {formatLiters(goal)}</span>
            </p>
            <div
              role="progressbar"
              aria-label="Objectif du jour"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-3 h-3 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {total >= goal ? 'Objectif atteint, bravo !' : `Encore ${formatLiters(goal - total)} à boire aujourd’hui.`}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3">
            {GLASSES.map((glass, index) => (
              <Button
                key={glass.volumeMl}
                variant="outline"
                className="h-auto flex-col gap-1 rounded-2xl py-4"
                disabled={adding}
                onClick={() => void drink(glass.volumeMl)}
              >
                <span className="flex h-7 items-end">
                  <GlassWater className={index === 0 ? 'size-5' : 'size-7'} aria-hidden />
                </span>
                <span className="font-medium">{glass.label}</span>
                <span className="text-xs text-muted-foreground">{formatCl(glass.volumeMl)}</span>
              </Button>
            ))}
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{last ? `Dernier verre à ${formatTime(last)} (il y a ${formatElapsed(now.getTime() - last.getTime())}).` : 'Rien bu aujourd’hui pour l’instant.'}</p>
            {remindersOn ? (
              reminder && (
                <p className="flex items-center gap-1.5">
                  <BellRing className="size-4 text-brand" aria-hidden />
                  Rappel vers {formatTime(reminder)} si tu ne bois rien d’ici là.
                </p>
              )
            ) : (
              <p>
                Pas de rappel sur cet appareil.{' '}
                <Link to="/reglages" className="font-medium text-foreground underline underline-offset-4">
                  Régler les notifications
                </Link>
              </p>
            )}
          </div>

          {hydration.intakes.length > 0 && (
            <section aria-labelledby="glasses-today">
              <h2 id="glasses-today" className="mb-2 text-sm font-medium">
                Verres du jour
              </h2>
              <ul className="divide-y rounded-2xl border bg-background">
                {[...hydration.intakes].reverse().map((intake) => (
                  <li key={intake.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="tabular-nums">{formatTime(intake.drunk_at)}</span>
                    <span className="flex-1 text-muted-foreground">{formatCl(intake.volume_ml)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Supprimer le verre de ${formatTime(intake.drunk_at)}`}
                      onClick={() => void hydration.remove(intake)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}

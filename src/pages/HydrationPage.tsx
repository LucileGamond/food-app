import { BellRing, GlassWater, Milk, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { useHydration } from '@/hooks/useHydration'
import { useNow } from '@/hooks/useNow'
import { useToday } from '@/hooks/useToday'
import type { IsoDate } from '@/lib/dates'
import { formatCl, formatElapsed, formatLiters, formatTime, lastDrink, nextReminder, totalMl } from '@/lib/hydration'

export function HydrationPage({ today: fixedToday, now: fixedNow }: { today?: IsoDate; now?: Date }) {
  const today = useToday(fixedToday)
  const now = useNow(fixedNow)
  const api = useApi()
  const { settings, ready, loadError: settingsError, reload: reloadSettings, notifications } = useSettings()
  const hydration = useHydration(api, today)
  const [adding, setAdding] = useState(false)

  const goal = settings.hydrationGoalMl
  const containers = settings.hydrationContainers
  const smallest = Math.min(...containers.map((c) => c.volumeMl))
  const total = totalMl(hydration.intakes)
  const percent = Math.min(100, Math.round((total / goal) * 100))
  const last = lastDrink(hydration.intakes)
  const reminder = nextReminder(hydration.intakes, goal, now)
  const remindersOn = notifications.status === 'on' && !settings.mutedNotifications.includes('hydratation')

  async function drink(volumeMl: number) {
    setAdding(true)
    const added = await hydration.add(volumeMl)
    setAdding(false)
    return added
  }

  // Raccourci de l'icône (appui long → « Petit verre bu ») : /hydratation?boire note le plus petit contenant, une fois.
  // `?boire` n'est retiré qu'une fois le verre noté : en cas d'échec (hors ligne, réglages non chargés), un encadré
  // le dit et permet de réessayer.
  const [params, setParams] = useSearchParams()
  const shortcutDone = useRef(false)
  const [shortcutFailed, setShortcutFailed] = useState(false)
  const fromShortcut = params.has('boire')

  function drinkFromShortcut() {
    if (adding) return
    const glass = containers.find((c) => c.volumeMl === smallest) ?? containers[0]!
    void drink(glass.volumeMl).then((added) => {
      setShortcutFailed(!added)
      if (!added) return
      setParams({}, { replace: true })
      toast.success(`Noté : ${glass.name.toLowerCase()} (${formatCl(glass.volumeMl)})`)
    })
  }

  useEffect(() => {
    if (!fromShortcut || !ready || hydration.loading || shortcutDone.current) return
    shortcutDone.current = true
    drinkFromShortcut()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, une fois réglages et verres chargés
  }, [fromShortcut, ready, hydration.loading])

  const shortcutProblem = !fromShortcut
    ? null
    : !ready && settingsError
      ? 'Réglages non chargés : le petit verre du raccourci n’est pas noté.'
      : shortcutFailed
        ? 'Le petit verre du raccourci n’est pas noté.'
        : null

  return (
    <>
      <PageHeader title="Eau" description={`Objectif : ${formatLiters(goal)} par jour · rien que pour toi`} />

      {shortcutProblem && (
        <div className="mb-4">
          <LoadError message={shortcutProblem} onRetry={() => (ready ? drinkFromShortcut() : void reloadSettings())} />
        </div>
      )}

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
            {containers.map((container, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto flex-col gap-1 rounded-2xl py-4"
                disabled={adding}
                onClick={() => void drink(container.volumeMl)}
              >
                <span className="flex h-7 items-end">
                  {/* Gourde, bouteille : une bouteille ; verres : le plus petit en plus petit. */}
                  {container.volumeMl >= 500 ? (
                    <Milk className="size-7" aria-hidden />
                  ) : (
                    <GlassWater className={container.volumeMl <= smallest ? 'size-5' : 'size-7'} aria-hidden />
                  )}
                </span>
                <span className="max-w-full truncate font-medium">{container.name}</span>
                <span className="text-xs text-muted-foreground">{formatCl(container.volumeMl)}</span>
              </Button>
            ))}
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            <Link to="/reglages" className="underline underline-offset-4">
              Changer les contenants
            </Link>
          </p>

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

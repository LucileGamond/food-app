import { BellRing, Pause, Play, Plus, Smartphone, Timer as TimerIcon, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LinkifiedText } from '@/components/LinkifiedText'
import { findDurations, formatClock, formatTimerDuration, isRinging, androidTimerUrl, isAndroid, remainingMs, stepTimerId, TIMER_MAX_SECONDS, type Timer } from '@/lib/timers'
import { cn } from '@/lib/utils'

/** Texte d'une étape où chaque durée (« 20 min ») lance un minuteur ; celle déjà lancée affiche le temps restant. */
export function StepText({
  text,
  step,
  timers,
  now,
  onStart,
  className,
}: {
  text: string
  step: number
  timers: Timer[]
  now: number
  onStart: (id: string, label: string, seconds: number) => void
  className?: string
}) {
  const durations = findDurations(text)
  if (durations.length === 0) return <LinkifiedText text={text} className={className} />
  const parts: ReactNode[] = []
  let at = 0
  durations.forEach((duration) => {
    if (duration.start > at) parts.push(<LinkifiedText key={`t${at}`} text={text.slice(at, duration.start)} />)
    const id = stepTimerId(step, duration.start)
    const timer = timers.find((t) => t.id === id)
    parts.push(
      <button
        key={id}
        type="button"
        onClick={() => onStart(id, `Étape ${step + 1} · ${formatTimerDuration(duration.seconds)}`, duration.seconds)}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TimerIcon className="size-4" aria-hidden />
        {/* Nom lu : « Lancer un minuteur de 20 min », puis « Minuteur lancé : 20 min · 12:34 » (texte visible compris). */}
        <span className="sr-only">{timer ? 'Minuteur lancé :' : 'Lancer un minuteur de'}</span> {duration.text}
        {timer && <span className="tabular-nums"> · {isRinging(timer, now) ? 'prêt' : formatClock(remainingMs(timer, now))}</span>}
      </button>,
    )
    at = duration.end
  })
  if (at < text.length) parts.push(<LinkifiedText key={`t${at}`} text={text.slice(at)} />)
  return <span className={cn('break-words whitespace-pre-line', className)}>{parts}</span>
}

/** Ajout d'un minuteur libre, en minutes. */
export function NewTimerForm({ onStart, onClose }: { onStart: (minutes: number) => void; onClose: () => void }) {
  const [minutes, setMinutes] = useState('10')
  const value = Number(minutes.replace(',', '.'))
  const valid = Number.isFinite(value) && value > 0 && value * 60 <= TIMER_MAX_SECONDS

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    onStart(value)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-2xl border bg-background p-3 shadow-xs" aria-label="Nouveau minuteur">
      <label className="grid gap-1 text-sm font-medium">
        Minutes
        <Input id="new-timer-minutes" inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-10 w-24" autoFocus />
      </label>
      <Button type="submit" className="h-10 px-3" disabled={!valid}>
        <Play /> Lancer
      </Button>
      <Button type="button" variant="ghost" className="h-10 px-3" onClick={onClose}>
        Annuler
      </Button>
    </form>
  )
}

/** Minuteurs en cours, en bas de l'écran. */
export function TimersBar({
  timers,
  now,
  onPause,
  onResume,
  onAddMinute,
  onRemove,
}: {
  timers: Timer[]
  now: number
  onPause: (id: string) => void
  onResume: (id: string) => void
  onAddMinute: (id: string) => void
  onRemove: (id: string) => void
}) {
  if (timers.length === 0) return null
  const android = isAndroid(navigator.userAgent)
  return (
    <section
      aria-label="Minuteurs"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-h-[45dvh] max-w-3xl flex-wrap gap-2 overflow-y-auto px-4 py-2">
        {timers.map((timer) => {
          const ringing = isRinging(timer, now)
          const paused = timer.endsAt === null
          return (
            <li
              key={timer.id}
              className={cn('flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-xl border px-3 py-1.5', ringing && 'animate-pulse border-brand bg-brand text-white motion-reduce:animate-none')}
            >
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-xs', ringing ? 'text-white' : 'text-muted-foreground')}>{timer.label}</p>
                <p className="flex items-center gap-1 text-xl font-semibold tabular-nums" role={ringing ? 'alert' : undefined}>
                  {ringing ? (
                    <>
                      <BellRing className="size-5" aria-hidden /> Prêt !
                    </>
                  ) : (
                    formatClock(remainingMs(timer, now))
                  )}
                </p>
              </div>
              {ringing ? (
                <>
                  <Button variant="secondary" size="icon-lg" aria-label={`Encore une minute : ${timer.label}`} onClick={() => onAddMinute(timer.id)}>
                    <Plus />
                  </Button>
                  <Button variant="secondary" className="h-10 px-3" onClick={() => onRemove(timer.id)}>
                    Arrêter
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    aria-label={paused ? `Reprendre : ${timer.label}` : `Mettre en pause : ${timer.label}`}
                    onClick={() => (paused ? onResume(timer.id) : onPause(timer.id))}
                  >
                    {paused ? <Play /> : <Pause />}
                  </Button>
                  <Button variant="outline" size="icon-lg" aria-label={`Une minute de plus : ${timer.label}`} onClick={() => onAddMinute(timer.id)}>
                    <Plus />
                  </Button>
                  {android && (
                    // Essai : le minuteur du téléphone sonne même appli fermée ou téléphone verrouillé.
                    <a
                      href={androidTimerUrl(remainingMs(timer, now) / 1000, timer.label)}
                      className={cn(buttonVariants({ variant: 'outline', size: 'icon-lg' }))}
                      aria-label={`Minuteur du téléphone : ${timer.label}`}
                      title="Minuteur du téléphone"
                    >
                      <Smartphone />
                    </a>
                  )}
                  <Button variant="ghost" size="icon-lg" aria-label={`Supprimer : ${timer.label}`} onClick={() => onRemove(timer.id)}>
                    <X />
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

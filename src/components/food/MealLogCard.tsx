import { Ban, Beef, Flame, Leaf } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatShortDate } from '@/lib/dates'
import { LOG_KINDS, LOG_SLOTS, vegetarianShare, type DayLog, type LogKind, type LogSlot, type WeekStats } from '@/lib/mealLog'
import { cn } from '@/lib/utils'

const KIND_ICONS: Record<LogKind, typeof Leaf> = { vegetarian: Leaf, meat: Beef, skipped: Ban }

const ACTIVE: Record<LogKind, string> = {
  vegetarian: 'border-emerald-600 bg-emerald-600 text-white',
  meat: 'border-rose-700 bg-rose-700 text-white',
  skipped: 'border-foreground/60 bg-foreground/70 text-background',
}

interface Props {
  log: DayLog
  /** Réponses déduites du planning, proposées tant que rien n'est noté. */
  suggestions: DayLog
  streak: number
  onAnswer: (slot: LogSlot, kind: LogKind | null) => void
  /** En-tête : jour affiché (et sa navigation quand la page n'en a pas). */
  header?: ReactNode
}

/** Journal du jour : végé, non végé ou pas de repas, pour le petit-déjeuner, le midi et le soir. */
export function MealLogCard({ log, suggestions, streak, onAnswer, header }: Props) {
  return (
    <section aria-labelledby="meal-log-title" className="rounded-2xl border bg-background p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="meal-log-title" className="flex-1 font-semibold tracking-tight">
          Repas du jour
        </h2>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
            <Flame className="size-3.5" aria-hidden />
            {streak} jour{streak > 1 ? 's' : ''} d’affilée
          </span>
        )}
      </div>
      {header}
      <ul className="space-y-2">
        {LOG_SLOTS.map((slot) => {
          const answer = log[slot.value]
          const suggested = answer === undefined ? suggestions[slot.value] : undefined
          return (
            <li key={slot.value} className="flex flex-wrap items-center gap-2">
              <span className="w-20 shrink-0 text-sm font-medium">{slot.label}</span>
              <div role="group" aria-label={slot.label} className="flex flex-1 flex-wrap gap-1.5">
                {LOG_KINDS.map((kind) => {
                  const Icon = KIND_ICONS[kind.value]
                  const active = answer === kind.value
                  const hinted = suggested === kind.value
                  return (
                    <button
                      key={kind.value}
                      type="button"
                      aria-pressed={active}
                      title={hinted ? 'D’après le planning : touche pour confirmer' : undefined}
                      onClick={() => onAnswer(slot.value, active ? null : kind.value)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                        active ? ACTIVE[kind.value] : 'hover:bg-muted',
                        hinted && 'border-dashed border-brand text-brand',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      <span>{kind.label}</span>
                      {hinted && <span className="sr-only">, prévu au planning</span>}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Part de repas végés par semaine (« pas de repas » non compté). */
export function MealLogStats({ weeks }: { weeks: WeekStats[] }) {
  const current = weeks.at(-1)
  const share = current ? vegetarianShare(current) : null
  const all = weeks.reduce((sum, w) => ({ vegetarian: sum.vegetarian + w.vegetarian, meat: sum.meat + w.meat }), { vegetarian: 0, meat: 0 })
  const overall = vegetarianShare(all)
  return (
    <section aria-labelledby="meal-stats-title" className="rounded-2xl border bg-background p-4 shadow-xs">
      <h2 id="meal-stats-title" className="font-semibold tracking-tight">
        Repas végés
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {share === null ? 'Rien de noté cette semaine.' : `Cette semaine : ${share} % (${current!.vegetarian} sur ${current!.vegetarian + current!.meat}).`}
        {overall !== null && ` Sur ${weeks.length} semaines : ${overall} %.`}
      </p>
      <ol className="mt-3 flex h-28 items-end gap-1.5" aria-label="Part de repas végés par semaine">
        {weeks.map((w) => {
          const value = vegetarianShare(w)
          return (
            <li key={w.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[0.625rem] text-muted-foreground tabular-nums">{value === null ? '–' : `${value}%`}</span>
              <span className="flex w-full flex-1 items-end">
                <span
                  role="img"
                  aria-label={`Semaine du ${formatShortDate(w.week)} : ${value === null ? 'rien de noté' : `${value} % végé`}`}
                  className={cn('w-full rounded-t-md', value === null ? 'h-1 bg-muted' : 'bg-emerald-600/80')}
                  style={value === null ? undefined : { height: `${Math.max(value, 4)}%` }}
                />
              </span>
              {/* « 16/11 » : huit semaines tiennent sur un téléphone. */}
              <span className="text-[0.625rem] text-muted-foreground tabular-nums" aria-hidden>
                {w.week.slice(8, 10)}/{w.week.slice(5, 7)}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

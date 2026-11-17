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
  /** Statistiques des dernières semaines, sous le journal (absentes tant qu'elles chargent). */
  weeks?: WeekStats[]
}

/**
 * Journal du jour, compact : pour le petit-déjeuner, le midi et le soir, trois icônes (végé, non végé, pas de repas),
 * puis la part de repas végés des dernières semaines.
 */
export function MealLogCard({ log, suggestions, streak, onAnswer, header, weeks }: Props) {
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
      <ul className="space-y-1.5">
        {LOG_SLOTS.map((slot) => {
          const answer = log[slot.value]
          const suggested = answer === undefined ? suggestions[slot.value] : undefined
          return (
            <li key={slot.value} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-sm font-medium">{slot.label}</span>
              <SlotButtons label={slot.label} answer={answer} suggested={suggested} onAnswer={(kind) => onAnswer(slot.value, kind)} />
            </li>
          )
        })}
      </ul>
      {weeks && <MealLogStats weeks={weeks} />}
    </section>
  )
}

/** Les trois réponses d'un moment, en icônes (nom et infobulle pour chacune) ; un second appui efface la réponse. */
export function SlotButtons({
  label,
  answer,
  suggested,
  onAnswer,
  small = false,
}: {
  label: string
  answer: LogKind | undefined
  /** Réponse déduite du planning, proposée tant que rien n'est noté. */
  suggested: LogKind | undefined
  onAnswer: (kind: LogKind | null) => void
  small?: boolean
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex', small ? 'gap-1' : 'gap-1.5')}>
      {LOG_KINDS.map((kind) => {
        const Icon = KIND_ICONS[kind.value]
        const active = answer === kind.value
        const hinted = answer === undefined && suggested === kind.value
        return (
          <button
            key={kind.value}
            type="button"
            aria-pressed={active}
            aria-label={hinted ? `${kind.label}, prévu au planning` : kind.label}
            title={hinted ? `${kind.label} : d’après le planning, touche pour confirmer` : kind.label}
            onClick={() => onAnswer(active ? null : kind.value)}
            className={cn(
              'inline-flex items-center justify-center rounded-full border transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              small ? 'size-7' : 'size-9',
              active ? ACTIVE[kind.value] : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              hinted && 'border-dashed border-brand text-brand',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/** Part de repas végés par semaine (« pas de repas » non compté). */
function MealLogStats({ weeks }: { weeks: WeekStats[] }) {
  const current = weeks.at(-1)
  const share = current ? vegetarianShare(current) : null
  const all = weeks.reduce((sum, w) => ({ vegetarian: sum.vegetarian + w.vegetarian, meat: sum.meat + w.meat }), { vegetarian: 0, meat: 0 })
  const overall = vegetarianShare(all)
  return (
    <section aria-labelledby="meal-stats-title" className="mt-4 border-t pt-3">
      <h3 id="meal-stats-title" className="text-sm font-semibold tracking-tight">
        Repas végés
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {share === null ? 'Rien de noté cette semaine.' : `Cette semaine : ${share} % (${current!.vegetarian} sur ${current!.vegetarian + current!.meat}).`}
        {overall !== null && ` Sur ${weeks.length} semaines : ${overall} %.`}
      </p>
      <ol className="mt-3 flex h-24 items-end gap-1.5" aria-label="Part de repas végés par semaine">
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

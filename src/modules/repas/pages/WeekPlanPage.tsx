// Planifier la semaine en deux temps : qui mange à la maison (prérempli d'après l'agenda et les règles de chacun,
// modifiable), puis les plats « À planifier » placés par l'IA (ou à la main), modifiables avant de créer les repas.

import { AiIcon } from '@/components/AiIcon'
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck, ChefHat, ChevronsDownUp, ChevronsUpDown, Loader2, RotateCcw, Soup, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AppError, errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToday } from '@/hooks/useToday'
import { formatDay, formatShortDate, type IsoDate } from '@/lib/dates'
import { MAX_PORTIONS } from '@/lib/inbox'
import { slotKey, slotLabel, type Profile } from '@/lib/meals'
import { cn } from '@/lib/utils'
import { computePresence, type PresenceEvent, type PresenceRule } from '../lib/presence'
import {
  buildPlanRequest,
  draftWarnings,
  dayKind,
  dayNeedsAttention,
  daySummary,
  DAY_KIND_LABELS,
  dishEntries,
  earlierEntry,
  MAX_PLAN_DISHES,
  openSlots,
  parsePlan,
  placeDish,
  pruneEntries,
  setEntry,
  suggestedPortions,
  toPlanWeekMeals,
  canChooseDay,
  defaultPlanDays,
  MAX_PLAN_SPAN_DAYS,
  planHorizon,
  toggleDay,
  type DayKind,
  type Dish,
  type DraftEntry,
  type PlanSlot,
} from '../lib/weekPlan'

interface Loaded {
  profiles: Profile[]
  rules: PresenceRule[]
  events: PresenceEvent[]
  agendaFailed: boolean
  taken: Map<string, string[]>
  dishes: Dish[]
}

function useWeekData(start: IsoDate, end: IsoDate) {
  const api = useApi()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Une réponse arrivée après un changement de semaine (minuit) ou un nouvel essai est ignorée.
  const request = useRef(0)
  const load = useCallback(async () => {
    const id = ++request.current
    setError(null)
    setData(null)
    try {
      const [profiles, rules, events, meals, items] = await Promise.all([
        api.meals.listProfiles(),
        api.weekPlan.listRules(),
        api.agenda.listEvents(start, end).then(
          (list) => ({ list, failed: false }),
          () => ({ list: [], failed: true }),
        ),
        api.meals.listMeals(start, end),
        api.inbox.listItems('plan'),
      ])
      if (profiles.length === 0) throw new AppError('Impossible de charger le foyer.')
      const dishes = await api.weekPlan.listDishes(items)
      if (id !== request.current) return
      const taken = new Map<string, string[]>()
      for (const meal of meals) {
        const key = slotKey({ date: meal.meal_date, slot: meal.slot })
        taken.set(key, [...(taken.get(key) ?? []), meal.recipe.title])
      }
      setData({ profiles, rules, events: events.list, agendaFailed: events.failed, taken, dishes })
    } catch (e) {
      if (id === request.current) setError(errorMessage(e))
    }
  }, [api, start, end])

  useEffect(() => {
    void load()
  }, [load])

  /** Portions d'un plat changées sur la page (enregistrées sur l'élément « À planifier »). */
  const setDishPortions = useCallback((id: string, portions: number | null) => {
    setData((d) => d && { ...d, dishes: d.dishes.map((dish) => (dish.id === id ? { ...dish, portions } : dish)) })
  }, [])

  return { data, error, reload: load, setDishPortions }
}

const ordered = (ids: string[], profiles: readonly Profile[]) => profiles.map((p) => p.id).filter((id) => ids.includes(id))

const NO_PROFILES: Profile[] = []

/** `today` et `now` : imposés par les tests. */
export function WeekPlanPage({ today: fixedToday, now = Date.now }: { today?: IsoDate; now?: () => number }) {
  const today = useToday(fixedToday)
  const horizon = useMemo(() => planHorizon(today), [today])
  /** Jours cochés (libres, 14 jours au plus du premier au dernier), par défaut les 7 prochains. */
  const [days, setDays] = useState<IsoDate[]>(() => defaultPlanDays(today))
  const api = useApi()
  const navigate = useNavigate()
  const { data, error, reload, setDishPortions } = useWeekData(horizon[0]!, horizon.at(-1)!)
  const profiles = data?.profiles ?? NO_PROFILES
  /** Présence corrigée à la main, par créneau. */
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  /** Jours dépliés à l'étape de présence (absent : replié sauf s'il y a quelque chose à regarder). */
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({})
  const [entries, setEntries] = useState<DraftEntry[] | null>(null)
  /** Étape affichée : qui mange à la maison, ou le placement des plats. Le brouillon survit aux allers-retours. */
  const [step, setStep] = useState<'presence' | 'draft'>('presence')
  const [busy, setBusy] = useState<'propose' | 'save' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Passage à minuit (application restée ouverte) : jours, brouillon et corrections de la veille abandonnés.
  const [draftToday, setDraftToday] = useState(today)
  const start = useRef(today)
  useEffect(() => {
    start.current = today
  })
  if (draftToday !== today) {
    setDraftToday(today)
    setDays(defaultPlanDays(today))
    setOverrides({})
    setOpenDays({})
    setEntries(null)
    setStep('presence')
    setActionError(null)
  }

  const slots: PlanSlot[] = useMemo(() => {
    if (!data) return []
    return computePresence({ days, profiles, rules: data.rules, events: data.events, now: now() }).map((s) => {
      const key = slotKey(s)
      const manual = overrides[key]
      const people = manual ? ordered(manual, profiles) : s.people
      // Ajoutée à la main : la personne a le temps de cuisiner.
      const freeCooks = manual ? people.filter((id) => s.freeCooks.includes(id) || !s.people.includes(id)) : s.freeCooks
      return { ...s, people, freeCooks, taken: data.taken.get(key) ?? [] }
    })
  }, [data, days, profiles, overrides, now])

  const open = openSlots(slots)
  const dishes = data?.dishes ?? []

  const name = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Quelqu’un'

  function togglePerson(slot: PlanSlot, id: string) {
    const key = slotKey(slot)
    const people = slot.people.includes(id) ? slot.people.filter((p) => p !== id) : [...slot.people, id]
    setOverrides((o) => ({ ...o, [key]: people }))
  }

  async function propose() {
    setBusy('propose')
    setActionError(null)
    const from = today
    try {
      const response = await api.weekPlan.proposePlan(buildPlanRequest(days[0]!, slots, dishes, profiles))
      // Le jour a changé pendant la réponse : elle ne vaut plus.
      if (start.current === from) {
        setEntries(parsePlan(response, slots, dishes))
        setStep('draft')
      }
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function savePortions(id: string, portions: number | null) {
    const before = dishes.find((d) => d.id === id)?.portions ?? null
    setDishPortions(id, portions)
    try {
      await api.inbox.setPortions(id, portions)
    } catch (e) {
      setDishPortions(id, before)
      toast.error(errorMessage(e))
    }
  }

  async function save() {
    if (!entries) return
    setBusy('save')
    setActionError(null)
    try {
      const count = await api.weekPlan.saveWeek(toPlanWeekMeals(pruneEntries(entries, slots), slots, dishes))
      toast.success(count > 1 ? `${count} repas planifiés` : '1 repas planifié')
      navigate('/planning')
    } catch (e) {
      setActionError(errorMessage(e))
      setBusy(null)
    }
  }

  const back = (
    <Link to="/planning" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
      <ArrowLeft /> Planning
    </Link>
  )

  if (error) {
    return (
      <>
        <PageHeader title="Planifier la semaine" actions={back} />
        <LoadError message={error} onRetry={() => void reload()} />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Planifier la semaine" actions={back} />
        <div className="grid gap-4" aria-busy="true" aria-label="Chargement de la semaine">
          {horizon.slice(0, 3).map((d) => (
            <Skeleton key={d} className="h-32 rounded-2xl" />
          ))}
        </div>
      </>
    )
  }

  // Brouillon affiché : seulement à l'étape de placement, débarrassé des créneaux qui ne sont plus ouverts.
  const draft = step === 'draft' && entries ? pruneEntries(entries, slots) : null
  // Ce qui décide la présence de chaque jour : les jours sans surprise restent repliés.
  const dayKinds = new Map(
    days.map((date) => {
      const daySlots = slots.filter((s) => s.date === date)
      return [date, dayKind(daySlots, daySlots.some((s) => overrides[slotKey(s)] !== undefined), profiles)] as const
    }),
  )
  const allOpen = days.every((date) => openDays[date] ?? dayNeedsAttention(dayKinds.get(date) ?? 'all'))
  const warnings = draft ? draftWarnings(draft, slots, dishes, profiles) : new Map<string, string[]>()
  const placed = new Set(draft?.map((e) => e.dishId))
  const unplaced = dishes.filter((d) => !placed.has(d.id))

  return (
    <>
      <PageHeader
        title="Planifier la semaine"
        description={`${periodLabel(days)} · ${draft ? 'Plats proposés, à ajuster' : 'Qui mange à la maison ?'}`}
        actions={back}
      />

      {data.agendaFailed && <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Agenda indisponible : vérifie qui mange à la maison.</p>}
      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {actionError}
        </p>
      )}

      {!draft && <DayPicker horizon={horizon} chosen={days} onToggle={(day) => setDays((list) => toggleDay(list, day))} />}

      {!draft && <PresenceBanner kinds={dayKinds} allOpen={allOpen} onToggleAll={() => setOpenDays(Object.fromEntries(days.map((d) => [d, !allOpen])))} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {days.map((date) => {
          const daySlots = slots.filter((s) => s.date === date)
          const body = (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {daySlots.map((s) => {
                const key = slotKey(s)
                return (
                  <section key={key} role="group" aria-label={`${formatDay(s.date)} — ${slotLabel(s.slot)}`} className="rounded-xl bg-muted/40 p-2">
                    <h3 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{slotLabel(s.slot)}</h3>
                    {draft ? (
                      <DraftSlot
                        slot={s}
                        entries={draft}
                        slots={slots}
                        entry={draft.find((e) => e.date === s.date && e.slot === s.slot)}
                        dishes={dishes}
                        warnings={warnings.get(key) ?? []}
                        name={name}
                        onDish={(dishId) => setEntries((list) => placeDish(list ?? [], slots, s, dishId))}
                        onCook={(cookId) => setEntries((list) => setEntry(list ?? [], s, { cookId }))}
                        onPortions={savePortions}
                      />
                    ) : (
                      <PresenceSlot slot={s} profiles={profiles} onToggle={(id) => togglePerson(s, id)} />
                    )}
                  </section>
                )
              })}
            </div>
          )
          if (draft) {
            return (
              <article key={date} aria-label={formatDay(date)} className="rounded-2xl border bg-background p-3 shadow-xs">
                <h2 className="mb-2 px-1 font-semibold tracking-tight">{formatDay(date)}</h2>
                {body}
              </article>
            )
          }
          const kind = dayKinds.get(date) ?? 'all'
          return (
            <PresenceDay
              key={date}
              date={date}
              kind={kind}
              summary={daySummary(daySlots, profiles)}
              open={openDays[date] ?? dayNeedsAttention(kind)}
              onOpenChange={(value) => setOpenDays((o) => ({ ...o, [date]: value }))}
            >
              {body}
            </PresenceDay>
          )
        })}
      </div>

      <div className="sticky bottom-20 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        {draft ? (
          <>
            <p className="w-full text-sm text-muted-foreground">
              {unplaced.length ? `Non placés : ${unplaced.map((d) => d.title).join(', ')}` : 'Tous les plats sont placés.'}
            </p>
            <Button variant="outline" className="h-11" onClick={() => setStep('presence')} disabled={busy !== null}>
              <ArrowLeft /> Modifier qui mange
            </Button>
            <Button className="h-11" onClick={() => void save()} disabled={busy !== null || draft.length === 0}>
              {busy === 'save' ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck />}
              Valider la semaine
            </Button>
          </>
        ) : (
          <>
            <p className="w-full text-sm text-muted-foreground">
              {dishes.length === 0
                ? 'Rien dans « À planifier » : ajoute des plats depuis le planning.'
                : `${dishes.length > 1 ? `${dishes.length} plats à planifier` : '1 plat à planifier'} · ${open.length} créneaux à remplir`}
            </p>
            {dishes.length > MAX_PLAN_DISHES && (
              <p className="w-full text-sm text-amber-700 dark:text-amber-400">Seuls les {MAX_PLAN_DISHES} premiers plats sont proposés à l’IA.</p>
            )}
            {/* Un placement déjà commencé se reprend tel quel ; seul « Tout recommencer » le jette. */}
            {entries && entries.length > 0 ? (
              <>
                <Button variant="outline" className="h-11" onClick={() => setEntries(null)} disabled={busy !== null}>
                  <RotateCcw /> Tout recommencer
                </Button>
                <Button variant="outline" className="h-11" onClick={() => void propose()} disabled={busy !== null || dishes.length === 0 || open.length === 0}>
                  {busy === 'propose' ? <Loader2 className="animate-spin" aria-hidden /> : <AiIcon />}
                  Reproposer avec l’IA
                </Button>
                <Button className="h-11" onClick={() => setStep('draft')} disabled={busy !== null}>
                  <ArrowRight /> Reprendre le placement
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setEntries([])
                    setStep('draft')
                  }}
                  disabled={busy !== null || dishes.length === 0 || open.length === 0}
                >
                  Placer moi-même
                </Button>
                <Button className="h-11" onClick={() => void propose()} disabled={busy !== null || dishes.length === 0 || open.length === 0}>
                  {busy === 'propose' ? <Loader2 className="animate-spin" aria-hidden /> : <AiIcon />}
                  Proposer avec l’IA
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

const PAST = <p className="px-1 text-sm text-muted-foreground">Repas passé</p>

/** « Du 9 novembre au 15 novembre · 7 jours » */
function periodLabel(days: readonly IsoDate[]): string {
  if (days.length === 0) return 'Aucun jour choisi'
  const span = days.length > 1 ? `Du ${formatShortDate(days[0]!)} au ${formatShortDate(days.at(-1)!)}` : `Le ${formatShortDate(days[0]!)}`
  return `${span} · ${days.length > 1 ? `${days.length} jours` : '1 jour'}`
}

const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })

/** Jours à planifier, à cocher librement sur 4 semaines (14 jours au plus du premier au dernier). */
function DayPicker({ horizon, chosen, onToggle }: { horizon: IsoDate[]; chosen: IsoDate[]; onToggle: (day: IsoDate) => void }) {
  return (
    // Replié par défaut : les 7 prochains jours conviennent presque toujours, le calendrier prend tout l'écran.
    <details className="mb-4 rounded-2xl border bg-background shadow-xs [&[open]>summary]:border-b">
      <summary className="grid cursor-pointer gap-0.5 rounded-2xl p-3 marker:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold tracking-tight">Jours à planifier</span>
        <span className="text-xs text-muted-foreground">
          {chosen.length > 1 ? `${chosen.length} jours cochés` : '1 jour coché'} · {MAX_PLAN_SPAN_DAYS} jours au plus du premier au dernier
        </span>
      </summary>
      <div className="flex flex-wrap gap-1.5 p-3">
        {horizon.map((day) => {
          const on = chosen.includes(day)
          const allowed = on || canChooseDay(chosen, day)
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              disabled={!allowed}
              title={allowed ? undefined : `Plus de ${MAX_PLAN_SPAN_DAYS} jours après le premier jour coché`}
              onClick={() => onToggle(day)}
              className={cn(
                'h-10 min-w-16 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                on ? 'border-brand bg-brand text-white' : 'bg-background text-muted-foreground',
              )}
            >
              {/* Texte court affiché, nom complet lu : « Lundi 16 novembre ». */}
              <span aria-hidden>{shortDay.format(new Date(`${day}T00:00:00Z`))}</span>
              <span className="sr-only">{formatDay(day)}</span>
            </button>
          )
        })}
      </div>
    </details>
  )
}

/**
 * Portions à cuisiner pour un plat, réglées sur son premier repas : par défaut les couverts de tous ses repas
 * (restes compris), modifiables. La valeur est enregistrée sur l'élément « À planifier ».
 */
function PortionsField({ dish, suggested, onSave }: { dish: Dish; suggested: number | null; onSave: (id: string, portions: number | null) => Promise<void> }) {
  const [value, setValue] = useState(dish.portions ? String(dish.portions) : '')
  const portions = value.trim() === '' ? null : Number(value)
  const invalid = portions !== null && (!Number.isInteger(portions) || portions < 1 || portions > MAX_PORTIONS)
  const id = `portions-${dish.id}`

  function commit() {
    if (invalid || portions === dish.portions) return
    void onSave(dish.id, portions)
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">Portions à cuisiner</span>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_PORTIONS}
        placeholder={suggested === null ? '—' : String(suggested)}
        value={value}
        aria-label={`Portions à cuisiner pour « ${dish.title} »`}
        aria-invalid={invalid}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-9 w-20"
      />
    </label>
  )
}

/** Combien de jours n'ont rien à corriger, et un bouton pour tout déplier ou tout replier d'un coup. */
function PresenceBanner({ kinds, allOpen, onToggleAll }: { kinds: Map<IsoDate, DayKind>; allOpen: boolean; onToggleAll: () => void }) {
  const total = kinds.size
  if (total === 0) return null
  const quiet = [...kinds.values()].filter((k) => !dayNeedsAttention(k)).length
  return (
    <section aria-label="Présence de la semaine" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand/40 bg-brand/5 p-3">
      <p className="min-w-0 text-sm font-medium">
        {quiet === total
          ? total > 1
            ? `Les ${total} jours sont prêts, rien à corriger`
            : 'Rien à corriger'
          : `${quiet} jour${quiet > 1 ? 's' : ''} sur ${total} sans rien à corriger`}
      </p>
      <Button variant="outline" className="h-9" onClick={onToggleAll}>
        {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
        {allOpen ? 'Tout replier' : 'Tout déplier'}
      </Button>
    </section>
  )
}

/** Un jour de l'étape de présence : résumé d'une ligne, déplié d'une touche pour corriger qui mange. */
function PresenceDay({
  date,
  kind,
  summary,
  open,
  onOpenChange,
  children,
}: {
  date: IsoDate
  kind: DayKind
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-2xl border bg-background shadow-xs [&[open]>summary]:border-b"
    >
      <summary className="grid cursor-pointer gap-0.5 rounded-2xl p-3 marker:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 font-semibold tracking-tight">{formatDay(date)}</span>
          <span className={cn('shrink-0 text-xs', dayNeedsAttention(kind) ? 'font-medium text-brand' : 'text-muted-foreground')}>{DAY_KIND_LABELS[kind]}</span>
        </span>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </summary>
      <div className="p-3">{children}</div>
    </details>
  )
}

function PresenceSlot({ slot, profiles, onToggle }: { slot: PlanSlot; profiles: readonly Profile[]; onToggle: (id: string) => void }) {
  if (slot.past) return PAST
  if (slot.taken.length > 0) return <p className="px-1 text-sm text-muted-foreground">Déjà prévu : {slot.taken.join(', ')}</p>
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {profiles.map((p) => {
          const home = slot.people.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={home}
              onClick={() => onToggle(p.id)}
              className={cn(
                'h-10 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                home ? 'border-brand bg-brand text-white' : 'bg-background text-muted-foreground line-through',
              )}
            >
              {p.display_name}
            </button>
          )
        })}
      </div>
      {Object.entries(slot.notes).map(([id, note]) => (
        <p key={id} className="mt-1 px-1 text-xs text-muted-foreground">
          {profiles.find((p) => p.id === id)?.display_name} : {note}
        </p>
      ))}
    </>
  )
}

function DraftSlot({
  slot,
  entries,
  slots,
  entry,
  dishes,
  warnings,
  name,
  onDish,
  onCook,
  onPortions,
}: {
  slot: PlanSlot
  entries: readonly DraftEntry[]
  slots: readonly PlanSlot[]
  entry: DraftEntry | undefined
  dishes: Dish[]
  warnings: string[]
  name: (id: string) => string
  onDish: (dishId: string | null) => void
  onCook: (cookId: string | null) => void
  onPortions: (id: string, portions: number | null) => Promise<void>
}) {
  if (slot.taken.length > 0) return <p className="px-1 text-sm text-muted-foreground">Déjà prévu : {slot.taken.join(', ')}</p>
  if (slot.past) return PAST
  if (slot.people.length === 0) return <p className="px-1 text-sm text-muted-foreground">Personne à la maison</p>
  const dish = entry && dishes.find((d) => d.id === entry.dishId)
  // Un plat déjà cuisiné un autre jour revient ici en restes : c'est son premier repas qui se cuisine.
  const leftover = entry && earlierEntry(entries, slot, entry.dishId)
  return (
    <div className="grid gap-1.5">
      <p className="px-1 text-xs text-muted-foreground">{slot.people.map(name).join(' et ')}</p>
      <NativeSelect aria-label="Plat" value={entry?.dishId ?? ''} onChange={(e) => onDish(e.target.value || null)}>
        <option value="">—</option>
        {dishes.map((d) => (
          <option key={d.id} value={d.id}>
            {dishOption(d, entries, slot, entry)}
          </option>
        ))}
      </NativeSelect>
      {entry && dish && !leftover && <PortionsField key={`${dish.id}-${dish.portions}`} dish={dish} suggested={suggestedPortions(entries, slots, dish)} onSave={onPortions} />}
      {entry && leftover && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Soup className="size-3.5 shrink-0" aria-hidden />
          Restes de {shortDay.format(new Date(`${leftover.date}T00:00:00Z`))}, {slotLabel(leftover.slot).toLowerCase()}
        </p>
      )}
      {entry && (
        <label className="flex items-center gap-2 text-sm">
          <ChefHat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <NativeSelect aria-label="Qui cuisine" className="h-9 flex-1" value={entry.cookId ?? ''} onChange={(e) => onCook(e.target.value || null)}>
            {slot.people.map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
            <option value="">Personne (restes)</option>
          </NativeSelect>
        </label>
      )}
      {entry?.why && <p className="px-1 text-xs text-muted-foreground">{entry.why}</p>}
      {warnings.length > 0 && (
        <ul className="grid gap-0.5 px-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Nom du plat dans la liste d'un créneau : tel quel, « — restes » s'il est déjà cuisiné un jour d'avant, « — déjà
 * placé » s'il est posé ailleurs plus tard. Le plat du créneau lui-même garde son nom nu.
 */
function dishOption(dish: Dish, entries: readonly DraftEntry[], ref: PlanSlot, current: DraftEntry | undefined): string {
  if (current?.dishId === dish.id) return dish.title
  if (earlierEntry(entries, ref, dish.id)) return `${dish.title} — restes`
  return dishEntries(entries, dish.id).length > 0 ? `${dish.title} — déjà placé` : dish.title
}

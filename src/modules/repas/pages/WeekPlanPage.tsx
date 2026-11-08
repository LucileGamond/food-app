// Planifier la semaine en deux temps : qui mange à la maison (prérempli d'après l'agenda et les règles de chacun,
// modifiable), puis les plats « À planifier » placés par l'IA (ou à la main), modifiables avant de créer les repas.

import { AlertTriangle, ArrowLeft, CalendarCheck, ChefHat, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToday } from '@/hooks/useToday'
import { formatDay, formatRange, type IsoDate } from '@/lib/dates'
import { slotKey, slotLabel, type Profile } from '@/lib/meals'
import { cn } from '@/lib/utils'
import { computePresence, type PresenceEvent, type PresenceRule } from '../lib/presence'
import {
  buildPlanRequest,
  draftWarnings,
  openSlots,
  parsePlan,
  setEntry,
  toPlanWeekMeals,
  weekDays,
  type Dish,
  type DraftEntry,
  type PlanSlot,
} from '../lib/weekPlan'

interface Loaded {
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

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try {
      const [rules, events, meals, items] = await Promise.all([
        api.weekPlan.listRules(),
        api.agenda.listEvents(start, end).then(
          (list) => ({ list, failed: false }),
          () => ({ list: [], failed: true }),
        ),
        api.meals.listMeals(start, end),
        api.inbox.listItems('plan'),
      ])
      const dishes = await api.weekPlan.listDishes(items)
      const taken = new Map<string, string[]>()
      for (const meal of meals) {
        const key = slotKey({ date: meal.meal_date, slot: meal.slot })
        taken.set(key, [...(taken.get(key) ?? []), meal.recipe.title])
      }
      setData({ rules, events: events.list, agendaFailed: events.failed, taken, dishes })
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [api, start, end])

  useEffect(() => {
    void load()
  }, [load])

  return { data, error, reload: load }
}

const ordered = (ids: string[], profiles: readonly Profile[]) => profiles.map((p) => p.id).filter((id) => ids.includes(id))

export function WeekPlanPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useToday(fixedToday)
  const days = useMemo(() => weekDays(today), [today])
  const api = useApi()
  const navigate = useNavigate()
  const { profiles } = useAuth()
  const { data, error, reload } = useWeekData(days[0]!, days[6]!)
  /** Présence corrigée à la main, par créneau. */
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [entries, setEntries] = useState<DraftEntry[] | null>(null)
  const [busy, setBusy] = useState<'propose' | 'save' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const slots: PlanSlot[] = useMemo(() => {
    if (!data) return []
    return computePresence({ days, profiles, rules: data.rules, events: data.events }).map((s) => {
      const key = slotKey(s)
      const manual = overrides[key]
      const people = manual ? ordered(manual, profiles) : s.people
      // Ajoutée à la main : la personne a le temps de cuisiner.
      const freeCooks = manual ? people.filter((id) => s.freeCooks.includes(id) || !s.people.includes(id)) : s.freeCooks
      return { ...s, people, freeCooks, taken: data.taken.get(key) ?? [] }
    })
  }, [data, days, profiles, overrides])

  const open = openSlots(slots)
  const dishes = data?.dishes ?? []
  const warnings = entries ? draftWarnings(entries, slots, dishes, profiles) : new Map<string, string[]>()
  const name = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Quelqu’un'

  function togglePerson(slot: PlanSlot, id: string) {
    const key = slotKey(slot)
    const people = slot.people.includes(id) ? slot.people.filter((p) => p !== id) : [...slot.people, id]
    setOverrides((o) => ({ ...o, [key]: people }))
  }

  async function propose() {
    setBusy('propose')
    setActionError(null)
    try {
      const response = await api.weekPlan.proposePlan(buildPlanRequest(days[0]!, slots, dishes, profiles))
      setEntries(parsePlan(response, slots, dishes))
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!entries) return
    setBusy('save')
    setActionError(null)
    try {
      const count = await api.weekPlan.saveWeek(toPlanWeekMeals(entries, slots))
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
  if (!data || profiles.length === 0) {
    return (
      <>
        <PageHeader title="Planifier la semaine" actions={back} />
        <div className="grid gap-4" aria-busy="true" aria-label="Chargement de la semaine">
          {days.slice(0, 3).map((d) => (
            <Skeleton key={d} className="h-32 rounded-2xl" />
          ))}
        </div>
      </>
    )
  }

  const placed = new Set(entries?.map((e) => e.dishId))
  const unplaced = dishes.filter((d) => !placed.has(d.id))

  return (
    <>
      <PageHeader
        title="Planifier la semaine"
        description={`${formatRange(days[0]!, 7)} · ${entries ? 'Plats proposés, à ajuster' : 'Qui mange à la maison ?'}`}
        actions={back}
      />

      {data.agendaFailed && <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Agenda indisponible : vérifie qui mange à la maison.</p>}
      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          {actionError}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {days.map((date) => (
          <article key={date} aria-label={formatDay(date)} className="rounded-2xl border bg-background p-3 shadow-xs">
            <h2 className="mb-2 px-1 font-semibold tracking-tight">{formatDay(date)}</h2>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {slots
                .filter((s) => s.date === date)
                .map((s) => {
                  const key = slotKey(s)
                  const label = `${formatDay(s.date)} — ${slotLabel(s.slot)}`
                  return (
                    <section key={key} role="group" aria-label={label} className="rounded-xl bg-muted/40 p-2">
                      <h3 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{slotLabel(s.slot)}</h3>
                      {entries ? (
                        <DraftSlot
                          slot={s}
                          entry={entries.find((e) => e.date === s.date && e.slot === s.slot)}
                          dishes={dishes}
                          warnings={warnings.get(key) ?? []}
                          name={name}
                          onChange={(patch) => setEntries((list) => setEntry(list ?? [], s, patch))}
                        />
                      ) : (
                        <PresenceSlot slot={s} profiles={profiles} onToggle={(id) => togglePerson(s, id)} />
                      )}
                    </section>
                  )
                })}
            </div>
          </article>
        ))}
      </div>

      <div className="sticky bottom-20 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        {entries ? (
          <>
            <p className="w-full text-sm text-muted-foreground">
              {unplaced.length ? `Non placés : ${unplaced.map((d) => d.title).join(', ')}` : 'Tous les plats sont placés.'}
            </p>
            <Button variant="outline" className="h-11" onClick={() => setEntries(null)} disabled={busy !== null}>
              <ArrowLeft /> Modifier qui mange
            </Button>
            <Button className="h-11" onClick={() => void save()} disabled={busy !== null || entries.length === 0}>
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
            <Button variant="outline" className="h-11" onClick={() => setEntries([])} disabled={busy !== null || dishes.length === 0 || open.length === 0}>
              Placer moi-même
            </Button>
            <Button className="h-11" onClick={() => void propose()} disabled={busy !== null || dishes.length === 0 || open.length === 0}>
              {busy === 'propose' ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles />}
              Proposer avec l’IA
            </Button>
          </>
        )}
      </div>
    </>
  )
}

function PresenceSlot({ slot, profiles, onToggle }: { slot: PlanSlot; profiles: readonly Profile[]; onToggle: (id: string) => void }) {
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
  entry,
  dishes,
  warnings,
  name,
  onChange,
}: {
  slot: PlanSlot
  entry: DraftEntry | undefined
  dishes: Dish[]
  warnings: string[]
  name: (id: string) => string
  onChange: (patch: Partial<Pick<DraftEntry, 'dishId' | 'cookId'>> | null) => void
}) {
  if (slot.taken.length > 0) return <p className="px-1 text-sm text-muted-foreground">Déjà prévu : {slot.taken.join(', ')}</p>
  if (slot.people.length === 0) return <p className="px-1 text-sm text-muted-foreground">Personne à la maison</p>
  return (
    <div className="grid gap-1.5">
      <p className="px-1 text-xs text-muted-foreground">{slot.people.map(name).join(' et ')}</p>
      <NativeSelect
        aria-label="Plat"
        value={entry?.dishId ?? ''}
        onChange={(e) => onChange(e.target.value ? { dishId: e.target.value, ...(entry ? {} : { cookId: slot.freeCooks[0] ?? slot.people[0] ?? null }) } : null)}
      >
        <option value="">—</option>
        {dishes.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </NativeSelect>
      {entry && (
        <label className="flex items-center gap-2 text-sm">
          <ChefHat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <NativeSelect aria-label="Qui cuisine" className="h-9 flex-1" value={entry.cookId ?? ''} onChange={(e) => onChange({ cookId: e.target.value || null })}>
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

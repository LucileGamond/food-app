import { BellRing, CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { FoodItemRow } from '@/components/food/FoodItemRow'
import { PeriodDialog } from '@/components/food/PeriodDialog'
import { ProfileSwitch, useProfileParam } from '@/components/food/ProfileSwitch'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useFoodTracking } from '@/hooks/useFoodTracking'
import { addDays, currentHour, formatDay, todayIso, type IsoDate } from '@/lib/dates'
import {
  clampToPeriod,
  containsDate,
  formatPeriod,
  groupItems,
  mealStats,
  periodNotice,
  periodProgress,
  type FoodMeal,
} from '@/lib/food'
import { cn } from '@/lib/utils'

/** Heure à partir de laquelle on rappelle qu'aucune consommation n'est notée aujourd'hui. */
const DAILY_REMINDER_HOUR = 20

const selectClass =
  'h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

export function FoodTrackingPage({ today = todayIso(), hour = currentHour() }: { today?: IsoDate; hour?: number }) {
  const api = useApi()
  const { profiles } = useAuth()
  const [profile, selectProfile] = useProfileParam()
  const tracking = useFoodTracking(api, profile?.id ?? null, today)
  const { period, items } = tracking
  const [day, setDay] = useState<{ periodId: string; date: IsoDate } | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<FoodMeal>>(new Set())
  const [dialog, setDialog] = useState<'none' | 'create' | 'delete'>('none')

  const date = period ? (day?.periodId === period.id ? day.date : clampToPeriod(today, period)) : today
  const groups = useMemo(() => groupItems(items), [items])
  const notice = periodNotice(tracking.periods, today)
  const progress = period ? periodProgress(period, date) : null
  const nothingToday =
    period !== null && containsDate(period, today) && hour >= DAILY_REMINDER_HOUR && !items.some((i) => i.consumptions.some((c) => c.consumed_on === today))

  const goTo = (next: IsoDate) => period && setDay({ periodId: period.id, date: clampToPeriod(next, period) })
  const toggle = (meal: FoodMeal) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(meal)) next.delete(meal)
      else next.add(meal)
      return next
    })
  const { add, remove } = tracking
  const onAdd = useCallback((itemId: string, d: IsoDate) => void add(itemId, d), [add])
  const onRemove = useCallback((itemId: string, d: IsoDate) => void remove(itemId, d), [remove])

  const createButton = (
    <Button className="h-10 px-4" onClick={() => setDialog('create')} disabled={!profile}>
      <CalendarPlus /> Nouvelle période
    </Button>
  )
  const planLink = (
    <Link to={`/plan/modifier${profile ? `?profil=${profile.id}` : ''}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-4')}>
      <ClipboardList /> Modifier le plan
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Plan"
        description={profile ? `Quotas du plan alimentaire de ${profile.display_name}` : 'Quotas du plan alimentaire'}
        actions={
          <>
            {planLink}
            {createButton}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ProfileSwitch profiles={profiles} value={profile?.id ?? null} onChange={selectProfile} />
        {tracking.periods.length > 0 && period && (
          <div className="flex items-center gap-1">
            <label htmlFor="period-select" className="sr-only">
              Période
            </label>
            <select
              id="period-select"
              className={selectClass}
              value={period.id}
              onChange={(e) => tracking.selectPeriod(e.target.value)}
            >
              {tracking.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPeriod(p)}
                  {containsDate(p, today) ? ' (en cours)' : ''}
                </option>
              ))}
            </select>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Actions sur la période" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
                  <Trash2 /> Supprimer la période
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {tracking.loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{tracking.loadError}</p>
          <Button variant="outline" onClick={() => void tracking.reload()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : tracking.loading || !profile ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement du plan">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : !period ? (
        <EmptyState
          icon={CalendarPlus}
          title="Aucune période"
          description="Une période reprend les quotas du plan : crée-la pour commencer à noter ce que tu manges."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {planLink}
              {createButton}
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {(notice || nothingToday) && (
            <div role="status" className="flex items-start gap-3 rounded-xl border bg-background p-4 text-sm shadow-xs">
              <BellRing className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div className="flex-1 space-y-0.5">
                {notice && <p className="font-medium">{notice.message}</p>}
                {nothingToday && <p className={cn(notice && 'text-muted-foreground')}>Rien de noté aujourd’hui.</p>}
              </div>
              {notice && (
                <Button variant="outline" size="sm" onClick={() => setDialog('create')}>
                  Créer
                </Button>
              )}
            </div>
          )}

          <div className="sticky top-14 z-20 -mx-4 border-b bg-page/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-2xl md:border md:bg-background/95 md:shadow-xs">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-lg" aria-label="Jour précédent" disabled={date <= period.start_date} onClick={() => goTo(addDays(date, -1))}>
                <ChevronLeft />
              </Button>
              {/* Le jour affiché est cliquable : un sélecteur de date permet de noter après coup. */}
              <div className="relative min-w-0 flex-1 rounded-lg text-center hover:bg-muted has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50">
                <p className="flex items-center justify-center gap-1.5 truncate font-semibold tracking-tight" aria-live="polite">
                  <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  {formatDay(date)}
                </p>
                {progress && (
                  <p className="text-xs text-muted-foreground">
                    Jour {progress.day} sur {progress.total}
                  </p>
                )}
                <input
                  type="date"
                  aria-label="Date de saisie"
                  min={period.start_date}
                  max={period.end_date}
                  value={date}
                  onChange={(e) => e.target.value && goTo(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker()
                    } catch {
                      // Navigateur sans showPicker : le champ natif reste utilisable.
                    }
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </div>
              <Button variant="outline" size="icon-lg" aria-label="Jour suivant" disabled={date >= period.end_date} onClick={() => goTo(addDays(date, 1))}>
                <ChevronRight />
              </Button>
              {containsDate(period, today) && date !== today && (
                <Button variant="ghost" className="h-9" onClick={() => goTo(today)}>
                  Aujourd’hui
                </Button>
              )}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cette période ne contient aucun aliment.</p>
          ) : (
            groups.map((group) => {
              const stats = mealStats(
                group.categories.flatMap((c) => c.items),
                date,
              )
              const open = !collapsed.has(group.meal)
              const headingId = `meal-${group.meal}`
              return (
                <section key={group.meal} aria-labelledby={headingId} className="rounded-2xl border bg-background shadow-xs">
                  <h2 id={headingId}>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggle(group.meal)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden />
                      <span className="flex-1 font-semibold tracking-tight">{group.label}</span>
                      {stats.onDate > 0 && (
                        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                          {stats.onDate} noté{stats.onDate > 1 ? 's' : ''}
                        </span>
                      )}
                      {stats.overItems > 0 && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          {stats.overItems} hors plan
                        </span>
                      )}
                    </button>
                  </h2>
                  {open && (
                    <div className="space-y-3 border-t px-4 pt-3 pb-2">
                      {group.categories.map((category) => (
                        <div key={category.name}>
                          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{category.name}</h3>
                          <ul className="divide-y">
                            {category.items.map((item) => (
                              <FoodItemRow key={item.id} item={item} date={date} onAdd={onAdd} onRemove={onRemove} />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
      )}

      <PeriodDialog
        open={dialog === 'create'}
        onOpenChange={(open) => !open && setDialog('none')}
        periods={tracking.periods}
        today={today}
        onSubmit={tracking.createPeriod}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog('none')}
        title="Supprimer cette période ?"
        description={period ? `${formatPeriod(period)} : toutes les consommations notées sur cette période seront perdues.` : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (period) await tracking.deletePeriod(period.id)
        }}
      />
    </>
  )
}

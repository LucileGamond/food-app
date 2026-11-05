import { Check, CheckCircle2, Droplets, Loader2, Plus, Sprout, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { capitalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import type { WaterInput } from '../api'
import { formatRelativeDay, formatTime } from '../lib/dates'
import { formatAmount } from '../lib/format'
import { mainPhotoPath, type Plant } from '../lib/plants'
import type { DoneToday, PlantStatus, UpcomingWatering } from '../lib/status'
import { usePlantPhotoUrls, useProfileName } from '../hooks/usePlants'
import { PlantThumb } from './PlantThumb'
import { WateringStatus } from './WateringStatus'

interface Props {
  plants: Plant[]
  toWater: PlantStatus[]
  doneToday: DoneToday[]
  upcoming: UpcomingWatering[]
  today: string
  onWater: (input: WaterInput, plantName: string) => void
  onUndo: (eventId: string) => void
  wateringPlantId: string | null
  undoingEventId: string | null
}

/** Onglet « À arroser » : ce qu'il reste à faire aujourd'hui, ce qui a été fait et par qui, ce qui arrive. */
export function TodayView({ plants, toWater, doneToday, upcoming, today, onWater, onUndo, wateringPlantId, undoingEventId }: Props) {
  const nameOf = useProfileName()
  const paths = [...new Set([...toWater.map((s) => s.plant), ...doneToday.map((d) => d.plant)].flatMap((p) => mainPhotoPath(p) ?? []))]
  const urls = usePlantPhotoUrls(paths)
  const urlOf = (plant: Plant) => {
    const path = mainPhotoPath(plant)
    return path ? urls[path] : undefined
  }

  if (!plants.some((p) => p.archived_at === null)) {
    return (
      <EmptyState
        icon={Sprout}
        title="Aucune plante pour l’instant"
        description="Ajoute ta première plante et ses règles d’arrosage : les rappels apparaîtront ici."
        action={
          <Link to="/plantes/nouvelle" className={cn(buttonVariants(), 'h-10')}>
            <Plus /> Ajouter une plante
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="to-water-title" className="space-y-3">
        <h2 id="to-water-title" className="text-sm font-semibold text-muted-foreground">
          À arroser {toWater.length > 0 && <span className="text-foreground">({toWater.length})</span>}
        </h2>
        {toWater.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft">
              <CheckCircle2 className="size-5 text-brand" aria-hidden />
            </span>
            <div>
              <p className="font-medium">Tout est arrosé</p>
              <p className="text-sm text-muted-foreground">Rien d’autre à faire aujourd’hui.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {toWater.map((status) => {
              const { plant } = status
              const pending = status.schedule.pending!
              const busy = wateringPlantId === plant.id
              return (
                <li key={plant.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <PlantThumb url={urlOf(plant)} name={plant.name} className="size-12 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/plantes/${plant.id}`} className="block truncate font-medium hover:underline">
                      {plant.name}
                    </Link>
                    <WateringStatus status={status} today={today} className="text-xs sm:text-sm" />
                  </div>
                  <Button
                    className="h-10 shrink-0 bg-water text-white hover:bg-water/90 dark:text-background"
                    disabled={busy}
                    aria-label={`Marquer ${plant.name} comme arrosée`}
                    onClick={() => onWater({ plantId: plant.id, scheduledOn: pending.date, ruleId: pending.ruleId, amountMl: pending.amountMl }, plant.name)}
                  >
                    {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Droplets aria-hidden />}
                    <span className="hidden sm:inline">Arrosée</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {doneToday.length > 0 && (
        <section aria-labelledby="done-title" className="space-y-3">
          <h2 id="done-title" className="text-sm font-semibold text-muted-foreground">
            Déjà arrosées aujourd’hui
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {doneToday.map(({ plant, event }) => (
              <li key={event.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                <div className="relative">
                  <PlantThumb url={urlOf(plant)} name={plant.name} className="size-12 rounded-lg opacity-80" />
                  <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-background dark:text-background">
                    <Check className="size-3" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/plantes/${plant.id}`} className="block truncate font-medium hover:underline">
                    {plant.name}
                  </Link>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Arrosée à {formatTime(event.watered_at)} par <span className="font-medium text-foreground">{nameOf(event.done_by)}</span>
                    {event.amount_ml !== null && <> · {formatAmount(event.amount_ml)}</>}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="h-10 shrink-0"
                  disabled={undoingEventId === event.id}
                  aria-label={`Annuler l’arrosage de ${plant.name}`}
                  onClick={() => onUndo(event.id)}
                >
                  <Undo2 aria-hidden />
                  <span className="hidden sm:inline">Annuler</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-title" className="space-y-3">
          <h2 id="upcoming-title" className="text-sm font-semibold text-muted-foreground">
            Cette semaine
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-background text-sm">
            {upcoming.map(({ plant, occurrence }) => (
              <li key={`${plant.id}-${occurrence.date}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link to={`/plantes/${plant.id}`} className="min-w-0 truncate hover:underline">
                  {plant.name}
                </Link>
                <span className="shrink-0 text-muted-foreground">
                  {capitalize(formatRelativeDay(occurrence.date, today))} · {formatAmount(occurrence.amountMl)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

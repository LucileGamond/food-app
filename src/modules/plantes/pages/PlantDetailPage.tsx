import { addDays } from '@watering/civil-date.ts'
import { upcoming } from '@watering/schedule.ts'
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Droplets, Loader2, MapPin, MoreHorizontal, Pencil, Ruler, SearchX, Sprout, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { capitalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import { LastWatered } from '../components/LastWatered'
import { PlantThumb } from '../components/PlantThumb'
import { WateringHistory } from '../components/WateringHistory'
import { WateringStatus } from '../components/WateringStatus'
import { formatFullDate, formatRelativeDay } from '../lib/dates'
import { describeRule, formatAmount, formatCm, formatMonths } from '../lib/format'
import { sortedPhotos, toEngineRule, type Plant, type WateringEvent } from '../lib/plants'
import { buildStatuses } from '../lib/status'
import { usePlantDetail, usePlantPhotoUrls, usePlantsToday, useWateringActions } from '../hooks/usePlants'

function BackLink() {
  return (
    <Link to="/plantes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> Plantes
    </Link>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = `card-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-background p-5 shadow-xs">
      <h2 id={id} className="mb-4 font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string | null }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value ?? '—'}</dd>
    </div>
  )
}

/** Fiche d'une plante : photos, informations, arrosage (état, règles, prochains) et historique. */
export function PlantDetailPage({ today: fixedToday }: { today?: string }) {
  const { id = '' } = useParams()
  const today = usePlantsToday(fixedToday)
  const { detail, error, reload } = usePlantDetail(id)

  if (error) return <LoadError message={error} onRetry={reload} />
  if (!detail) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la plante">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!detail.plant) {
    return (
      <>
        <BackLink />
        <EmptyState icon={SearchX} title="Plante introuvable" description="Elle a peut-être été supprimée." />
      </>
    )
  }
  return <PlantDetail key={detail.plant.id} plant={detail.plant} events={detail.events} today={today} reload={reload} />
}

function PlantDetail({ plant, events, today, reload }: { plant: Plant; events: WateringEvent[]; today: string; reload: () => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const { water, undo, wateringPlantId } = useWateringActions(reload)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const photos = sortedPhotos(plant)
  const urls = usePlantPhotoUrls(photos.map((p) => p.storage_path))
  const [selected, setSelected] = useState(0)
  const current = photos[Math.min(selected, photos.length - 1)]

  const archived = plant.archived_at !== null
  const status = buildStatuses([{ ...plant, archived_at: null }], events, today)[0]!
  const { pending, next } = status.schedule
  const coming = upcoming(plant.rules.map(toEngineRule), addDays(today, 1), 5)

  async function setArchived(value: boolean) {
    try {
      await api.plants.setArchived(plant.id, value)
      toast.success(value ? 'Plante archivée : plus de rappels' : 'Plante réactivée')
      reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <article>
      <BackLink />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {plant.name}
            {archived && <Badge variant="secondary">Archivée</Badge>}
          </h1>
          {plant.species && <p className="mt-1 text-sm text-muted-foreground italic">{plant.species}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/plantes/${plant.id}/modifier`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            <Pencil /> Modifier
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" className="size-10" aria-label="Plus d’actions" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => void setArchived(!archived)}>
                {archived ? <ArchiveRestore /> : <Archive />}
                {archived ? 'Réactiver' : 'Archiver'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-3">
          <PlantThumb url={current ? urls[current.storage_path] : undefined} name={plant.name} className="aspect-square w-full rounded-2xl border" />
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Voir la photo ${i + 1}`}
                  aria-pressed={photo === current}
                  onClick={() => setSelected(i)}
                  className={cn('size-16 shrink-0 overflow-hidden rounded-lg border-2', photo === current ? 'border-brand' : 'border-transparent')}
                >
                  <PlantThumb url={urls[photo.storage_path]} name={`${plant.name} — photo ${i + 1}`} className="size-full" />
                </button>
              ))}
            </div>
          )}

          <Card title="Informations">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Info icon={MapPin} label="Emplacement" value={plant.location} />
              <Info icon={CalendarDays} label="Plantée le" value={plant.planted_on && formatFullDate(plant.planted_on)} />
              <Info icon={Ruler} label="Taille à la plantation" value={plant.planted_height_cm !== null ? formatCm(plant.planted_height_cm) : null} />
              <Info icon={Sprout} label="Pot" value={plant.pot_diameter_cm !== null ? `Ø ${formatCm(plant.pot_diameter_cm)}` : null} />
            </dl>
            {plant.notes && <p className="mt-4 border-t pt-4 text-sm whitespace-pre-line">{plant.notes}</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Arrosage">
            {archived ? (
              <p className="text-sm text-muted-foreground">Plante archivée : aucun rappel n’est envoyé.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1">
                    <WateringStatus status={status} today={today} />
                    <LastWatered event={events[0] ?? null} today={today} />
                  </div>
                  <Button
                    className="h-10 bg-water text-white hover:bg-water/90 dark:text-background"
                    disabled={wateringPlantId === plant.id}
                    onClick={() =>
                      void water(
                        pending
                          ? { plantId: plant.id, scheduledOn: pending.date, ruleId: pending.ruleId, amountMl: pending.amountMl }
                          : { plantId: plant.id, scheduledOn: null, ruleId: null, amountMl: next?.amountMl ?? null },
                        plant.name,
                      )
                    }
                  >
                    {wateringPlantId === plant.id ? <Loader2 className="animate-spin" aria-hidden /> : <Droplets aria-hidden />}
                    {pending ? 'Marquer comme arrosée' : 'Arroser maintenant'}
                  </Button>
                </div>

                {plant.rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune règle d’arrosage.{' '}
                    <Link to={`/plantes/${plant.id}/modifier`} className="font-medium text-foreground underline underline-offset-4">
                      En ajouter une
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2" aria-label="Règles d’arrosage">
                    {plant.rules
                      .toSorted((a, b) => a.first_watering_on.localeCompare(b.first_watering_on))
                      .map((rule) => (
                        <li key={rule.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
                          <span className="font-medium">{formatMonths(rule.months)}</span>
                          <span className="text-muted-foreground">{capitalize(describeRule(rule))}</span>
                          {rule.note && <span className="w-full text-xs text-muted-foreground italic">{rule.note}</span>}
                        </li>
                      ))}
                  </ul>
                )}

                {coming.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">Prochains arrosages</h3>
                    <ul className="flex flex-wrap gap-2">
                      {coming.map((o) => (
                        <li key={o.date} className="rounded-full bg-water-soft px-3 py-1 text-sm">
                          {capitalize(formatRelativeDay(o.date, today))} · {formatAmount(o.amountMl)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="Historique">
            <WateringHistory events={events} onUndo={undo} />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${plant.name} ?`}
        description="La fiche, les photos, les règles et tout l’historique d’arrosage seront supprimés définitivement. Pour simplement arrêter les rappels, archive-la plutôt."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          try {
            await api.plants.deletePlant(plant)
            toast.success('Plante supprimée')
            navigate('/plantes', { replace: true })
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </article>
  )
}

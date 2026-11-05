import { Archive, MapPin, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { foldText } from '@/lib/text'
import { cn } from '@/lib/utils'
import { mainPhotoPath, type Plant, type WateringEvent } from '../lib/plants'
import { buildStatuses, locations, type PlantStatus } from '../lib/status'
import { usePlantPhotoUrls } from '../hooks/usePlants'
import { LastWatered } from './LastWatered'
import { PlantThumb } from './PlantThumb'
import { WateringStatus } from './WateringStatus'

interface Props {
  plants: Plant[]
  statuses: PlantStatus[]
  events: WateringEvent[]
  today: string
}

/** Onglet « Toutes » : grille des plantes avec recherche, filtre par emplacement et archives. */
export function AllPlantsView({ plants, statuses, events, today }: Props) {
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const archivedStatuses = useMemo(
    () => buildStatuses(plants.filter((p) => p.archived_at !== null).map((p) => ({ ...p, archived_at: null })), events, today),
    [plants, events, today],
  )
  const source = showArchived ? archivedStatuses : statuses
  const query = foldText(search)
  const visible = source.filter(
    ({ plant }) =>
      (location === null || plant.location === location) &&
      (query === '' || foldText(`${plant.name} ${plant.species ?? ''} ${plant.location ?? ''}`).includes(query)),
  )
  const urls = usePlantPhotoUrls(visible.flatMap(({ plant }) => mainPhotoPath(plant) ?? []))
  const places = locations(source.map((s) => s.plant))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une plante…"
            aria-label="Rechercher une plante"
            className="h-10 bg-background pl-9"
          />
        </div>
        {archivedStatuses.length > 0 && (
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => {
              setShowArchived((v) => !v)
              setLocation(null)
            }}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              showArchived ? 'border-foreground/20 bg-muted text-foreground' : 'bg-background',
            )}
          >
            <Archive className="size-4" aria-hidden />
            Archivées ({archivedStatuses.length})
          </button>
        )}
      </div>

      {places.length > 1 && (
        <div role="group" aria-label="Filtrer par emplacement" className="flex flex-wrap gap-2">
          {[null, ...places].map((place) => (
            <button
              key={place ?? 'all'}
              type="button"
              aria-pressed={location === place}
              onClick={() => setLocation(place)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                location === place ? 'border-brand bg-brand-soft font-medium text-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {place ?? 'Tous les emplacements'}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={SearchX} title="Aucune plante trouvée" description="Essaie un autre mot ou un autre emplacement." />
      ) : (
        <ul aria-label="Liste des plantes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((status) => {
            const { plant } = status
            const path = mainPhotoPath(plant)
            return (
              <li key={plant.id}>
                <Link
                  to={`/plantes/${plant.id}`}
                  className="group block overflow-hidden rounded-xl border bg-background shadow-xs transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <PlantThumb url={path ? urls[path] : undefined} name={plant.name} className="aspect-[4/3] w-full" />
                  <div className="space-y-2 p-4">
                    <div>
                      <h3 className="truncate font-semibold group-hover:underline">{plant.name}</h3>
                      <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                        {plant.species && <span className="truncate italic">{plant.species}</span>}
                        {plant.species && plant.location && <span aria-hidden>·</span>}
                        {plant.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {plant.location}
                          </span>
                        )}
                      </p>
                    </div>
                    {!showArchived && <WateringStatus status={status} today={today} />}
                    <LastWatered event={status.lastEvent} today={today} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

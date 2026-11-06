// Cartes de l'accueil « Aujourd’hui » : l'essentiel du jour de chaque section, avec les gestes les plus fréquents.

import { CheckCircle2, Droplets, Loader2, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { useAsync } from '@/hooks/useAsync'
import { useHydration } from '@/hooks/useHydration'
import { usePlanning } from '@/hooks/usePlanning'
import type { IsoDate } from '@/lib/dates'
import { formatLiters, GLASSES, totalMl } from '@/lib/hydration'
import { SLOTS, slotLabel } from '@/lib/meals'
import { capitalize } from '@/lib/text'
import { formatRelativeDay } from '@/modules/plantes/lib/dates'
import { formatAmount } from '@/modules/plantes/lib/format'
import { usePlantsOverview, usePlantsToday, useWateringActions } from '@/modules/plantes/hooks/usePlants'
import { useKnitProject } from '@/modules/tricot/hooks/useKnitProject'
import { currentStepIndex, MAX_ROW_COUNT, type KnitProjectSummary } from '@/modules/tricot/lib/pattern'

/** Carte d'une section : titre, lien vers la page, contenu. */
function HomeCard({ id, title, aside, to, linkLabel, children }: { id: string; title: string; aside?: ReactNode; to: string; linkLabel: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-2xl border bg-background p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="font-semibold tracking-tight">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-sm">
          {aside}
          <Link to={to} className="font-medium text-brand underline-offset-4 hover:underline">
            {linkLabel}
          </Link>
        </div>
      </div>
      {children}
    </section>
  )
}

const Loading = ({ label }: { label: string }) => <Skeleton className="h-12 rounded-lg" aria-busy="true" aria-label={label} />

/** Repas du jour (midi, soir). */
export function MealsTodayCard({ today }: { today: IsoDate }) {
  const api = useApi()
  const planning = usePlanning(api, today)
  const meals = planning.meals.filter((m) => m.meal_date === today)
  return (
    <HomeCard id="home-meals" title="Repas" to="/planning" linkLabel="Planning">
      {planning.loading ? (
        <Loading label="Chargement des repas" />
      ) : planning.loadError ? (
        <p className="text-sm text-destructive">{planning.loadError}</p>
      ) : meals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rien de prévu aujourd’hui.</p>
      ) : (
        <ul className="space-y-1.5">
          {SLOTS.flatMap((slot) => meals.filter((m) => m.slot === slot)).map((meal) => (
            <li key={meal.id} className="flex gap-2 text-sm">
              <span className="w-10 shrink-0 text-muted-foreground">{slotLabel(meal.slot)}</span>
              <span className="min-w-0 truncate">{meal.recipe.title}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  )
}

/** Eau bue aujourd'hui, et un verre en un geste. */
export function WaterCard({ today }: { today: IsoDate }) {
  const api = useApi()
  const { settings } = useSettings()
  const hydration = useHydration(api, today)
  const total = totalMl(hydration.intakes)
  const goal = settings.hydrationGoalMl
  return (
    <HomeCard id="home-water" title="Eau" aside={<span className="text-muted-foreground">{formatLiters(total)} sur {formatLiters(goal)}</span>} to="/hydratation" linkLabel="Détail">
      <div className="h-2 overflow-hidden rounded-full bg-water-soft" role="progressbar" aria-label="Eau bue aujourd’hui" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={total}>
        <div className="h-full rounded-full bg-water" style={{ width: `${Math.min(100, Math.round((total / goal) * 100))}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {GLASSES.map((glass) => (
          <Button key={glass.volumeMl} variant="outline" className="h-11" disabled={hydration.loading} onClick={() => void hydration.add(glass.volumeMl)}>
            {glass.label}
          </Button>
        ))}
      </div>
    </HomeCard>
  )
}

/** Plantes à arroser aujourd'hui, à noter d'un geste. */
export function PlantsCard() {
  const today = usePlantsToday()
  const { overview, error, reload } = usePlantsOverview(today)
  const { water, wateringPlantId } = useWateringActions(reload)
  const toWater = overview?.toWater ?? []
  const next = overview?.upcoming[0]
  return (
    <HomeCard id="home-plants" title="Plantes à arroser" aside={toWater.length > 0 && <span className="text-muted-foreground">{toWater.length}</span>} to="/plantes" linkLabel="Toutes">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !overview ? (
        <Loading label="Chargement des plantes" />
      ) : toWater.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-brand" aria-hidden />
          Tout est arrosé{next && ` · prochain : ${next.plant.name}, ${formatRelativeDay(next.occurrence.date, today)}`}
        </p>
      ) : (
        <ul className="divide-y">
          {toWater.slice(0, 4).map(({ plant, schedule }) => {
            const pending = schedule.pending!
            return (
              <li key={plant.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {plant.name} <span className="text-muted-foreground">· {formatAmount(pending.amountMl)}</span>
                </span>
                <Button
                  className="h-10 bg-water text-white hover:bg-water/90 dark:text-background"
                  disabled={wateringPlantId === plant.id}
                  aria-label={`Marquer ${plant.name} comme arrosée`}
                  onClick={() => void water({ plantId: plant.id, scheduledOn: pending.date, ruleId: pending.ruleId, amountMl: pending.amountMl }, plant.name)}
                >
                  {wateringPlantId === plant.id ? <Loader2 className="animate-spin" aria-hidden /> : <Droplets aria-hidden />}
                  Arrosée
                </Button>
              </li>
            )
          })}
          {toWater.length > 4 && <li className="pt-2 text-sm text-muted-foreground">et {toWater.length - 4} autre{toWater.length > 5 ? 's' : ''}</li>}
        </ul>
      )}
    </HomeCard>
  )
}

/** Projet de tricot en cours : l'étape et le rang à tricoter, à compter d'un geste. */
export function KnittingCard() {
  const api = useApi()
  const { data: projects, error } = useAsync(() => api.knitting.listProjects(), [api])
  // Le projet en cours le plus récemment touché.
  const current = projects?.filter((p) => p.stepsDone < p.stepsTotal).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (error || !projects || !current) return null
  return <KnittingProjectCard project={current} />
}

function KnittingProjectCard({ project }: { project: KnitProjectSummary }) {
  const api = useApi()
  const knit = useKnitProject(api, project.id)
  const steps = knit.project?.steps ?? []
  const step = steps[currentStepIndex(steps)]
  return (
    <HomeCard id="home-knitting" title={project.title} to={`/tricot/${project.id}`} linkLabel="Ouvrir">
      {!step ? (
        <Loading label="Chargement du projet" />
      ) : (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-medium">{capitalize(step.title)}</span>
            <span className="text-muted-foreground">Rang {step.rowCount + 1} à tricoter</span>
          </p>
          <Button className="h-11 px-4" disabled={step.rowCount >= MAX_ROW_COUNT} onClick={() => void knit.countRows(step.id, 1)}>
            <Plus aria-hidden /> 1 rang
          </Button>
        </div>
      )}
    </HomeCard>
  )
}

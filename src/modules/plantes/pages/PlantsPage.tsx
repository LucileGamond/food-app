import { Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadError } from '@/components/LoadError'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { AllPlantsView } from '../components/AllPlantsView'
import { TodayView } from '../components/TodayView'
import { usePlantsOverview, usePlantsToday, useWateringActions } from '../hooks/usePlants'

/** Plantes de la maison : à arroser aujourd'hui (et par qui c'est fait), toutes les plantes. Partagé par le foyer. */
export function PlantsPage({ today: fixedToday }: { today?: string }) {
  const today = usePlantsToday(fixedToday)
  const { overview, error, reload } = usePlantsOverview(today)
  const actions = useWateringActions(reload)
  // Onglet dans l'adresse : au retour d'une fiche, on retrouve celui qu'on avait.
  const [params, setParams] = useSearchParams()
  const view = params.get('vue') === 'toutes' ? 'toutes' : 'aujourdhui'

  return (
    <>
      <PageHeader
        title="Plantes"
        description="Les plantes de la maison et leurs arrosages."
        actions={
          <Link to="/plantes/nouvelle" className={cn(buttonVariants(), 'h-10')}>
            <Plus /> Ajouter une plante
          </Link>
        }
      />

      {error ? (
        <LoadError message={error} onRetry={reload} />
      ) : !overview ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des plantes">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <Tabs value={view} onValueChange={(value) => setParams(value === 'toutes' ? { vue: 'toutes' } : {}, { replace: true })}>
          <TabsList className="mb-4 h-10 w-full sm:w-fit">
            <TabsTrigger value="aujourdhui" className="px-4">
              À arroser
              {overview.toWater.length > 0 && <span className="rounded-full bg-water px-1.5 text-xs font-semibold text-white dark:text-background">{overview.toWater.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="toutes" className="px-4">
              Toutes ({overview.statuses.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="aujourdhui">
            <TodayView
              plants={overview.plants}
              toWater={overview.toWater}
              doneToday={overview.doneToday}
              upcoming={overview.upcoming}
              today={today}
              onWater={(input, name) => void actions.water(input, name)}
              onUndo={(id) => void actions.undo(id)}
              wateringPlantId={actions.wateringPlantId}
              undoingEventId={actions.undoingEventId}
            />
          </TabsContent>
          <TabsContent value="toutes">
            <AllPlantsView plants={overview.plants} statuses={overview.statuses} events={overview.events} today={today} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

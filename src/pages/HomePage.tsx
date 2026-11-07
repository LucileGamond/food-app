import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { ActivityCard } from '@/components/home/ActivityCard'
import { AgendaCard } from '@/components/home/AgendaCard'
import { KnittingCard, MealsTodayCard, PlantsCard, WaterCard } from '@/components/home/HomeCards'
import { PageHeader } from '@/components/PageHeader'
import { useSettings } from '@/app/SettingsContext'
import { useToday } from '@/hooks/useToday'
import { formatDay, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Accueil « Aujourd’hui » : l'essentiel du jour des pages affichées (rendez-vous, repas, eau, plantes, tricot) et ce que l'autre a fait. */
export function HomePage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useToday(fixedToday)
  const { loading, isEnabled } = useSettings()
  const cards = [
    isEnabled('agenda') && <AgendaCard key="agenda" today={today} />,
    isEnabled('planning') && <MealsTodayCard key="meals" today={today} />,
    isEnabled('hydratation') && <WaterCard key="water" today={today} />,
    isEnabled('plantes') && <PlantsCard key="plants" />,
    isEnabled('tricot') && <KnittingCard key="knitting" />,
    // Gestes de l'autre sur ce qu'on partage (plantes, planning, recettes, courses).
    (['plantes', 'planning', 'recettes', 'courses'] as const).some(isEnabled) && <ActivityCard key="activity" />,
  ].filter(Boolean)

  return (
    <>
      <PageHeader title="Aujourd’hui" description={formatDay(today)} />
      {loading ? null : cards.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="Rien à résumer ici"
          description="Affiche l’agenda, le planning, l’eau, les plantes ou le tricot dans les réglages : leur essentiel du jour apparaîtra ici."
          action={
            <Link to="/reglages" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
              Réglages
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{cards}</div>
      )}
    </>
  )
}

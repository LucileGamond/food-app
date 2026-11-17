import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { ActivityCard } from '@/components/home/ActivityCard'
import { AgendaCard } from '@/components/home/AgendaCard'
import { MealLogReminder } from '@/components/home/MealLogReminder'
import { KnittingCard, MealsTodayCard, PlantsCard, WaterCard } from '@/components/home/HomeCards'
import { PageHeader } from '@/components/PageHeader'
import { useSettings } from '@/app/SettingsContext'
import { useToday } from '@/hooks/useToday'
import { formatDay, type IsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * Accueil « Aujourd’hui » : l'essentiel du jour des pages affichées (rendez-vous, journal des repas, repas, eau,
 * plantes, tricot) et ce que l'autre a fait. Chaque carte ne s'affiche que si elle a quelque chose à montrer.
 */
export function HomePage({ today: fixedToday, hour }: { today?: IsoDate; hour?: number }) {
  const today = useToday(fixedToday)
  const { loading, isEnabled } = useSettings()
  const cards = [
    isEnabled('plan') && <MealLogReminder key="meal-log" today={today} hour={hour} />,
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
        <>
          {/* Cartes qui n'ont rien à montrer : absentes ; aucune : un mot plutôt qu'une page vide. */}
          <div className="peer grid grid-cols-1 gap-4 empty:hidden md:grid-cols-2">{cards}</div>
          <p className="hidden py-10 text-center text-sm text-muted-foreground peer-empty:block">Rien à signaler aujourd’hui.</p>
        </>
      )}
    </>
  )
}

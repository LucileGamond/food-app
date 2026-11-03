import { SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

/** Recette supprimée (ou adresse fausse) : fiche, mode cuisine, impression, modification. */
export function RecipeNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Recette introuvable"
      description="Elle a peut-être été supprimée."
      action={
        <Link to="/recettes" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
          Retour aux recettes
        </Link>
      }
    />
  )
}

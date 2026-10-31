import { BookOpen, Clock, Flame, ImageIcon, Leaf, Sprout, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatHistory, formatKcal, formatRating } from '@/lib/recipeList'
import { formatDuration, formatSource, type RecipeListItem } from '@/lib/recipes'
import { recipeSeason } from '@/lib/season'

/** Carte d'une recette dans une liste : photo, note, temps, calories, végé, de saison, livre, tags, historique. */
export function RecipeCard({ recipe, month, photoUrl }: { recipe: RecipeListItem; month: number; photoUrl: string | undefined }) {
  const source = formatSource(recipe.source, recipe.sourcePage)
  const seasonal = recipeSeason(recipe.ingredientNames, month).status === 'in'
  const kcal = formatKcal(recipe.kcal, recipe.nutritionPer)
  return (
    <Link
      to={`/recettes/${recipe.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-background shadow-xs transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="aspect-[4/3] bg-muted">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-6 text-muted-foreground/50" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-medium tracking-tight">{recipe.title}</h2>
        {(recipe.totalMinutes !== null || kcal || recipe.rating !== null || recipe.vegetarian || seasonal) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
            {recipe.rating !== null && (
              <span className="inline-flex items-center gap-1" aria-label={`Note ${formatRating(recipe.rating)} sur 5`}>
                <Star className="fill-amber-400 text-amber-400" aria-hidden /> {formatRating(recipe.rating)}
              </span>
            )}
            {recipe.totalMinutes !== null && (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden /> {formatDuration(recipe.totalMinutes)}
              </span>
            )}
            {kcal && (
              <span className="inline-flex items-center gap-1">
                <Flame aria-hidden /> {kcal}
              </span>
            )}
            {recipe.vegetarian && (
              <span className="inline-flex items-center gap-1">
                <Leaf aria-hidden /> Végé
              </span>
            )}
            {seasonal && (
              <span className="inline-flex items-center gap-1 font-medium text-brand">
                <Sprout aria-hidden /> De saison
              </span>
            )}
          </p>
        )}
        {source && (
          <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
            <BookOpen className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{source}</span>
          </p>
        )}
        {recipe.tags.length > 0 && <p className="truncate text-sm text-muted-foreground">{recipe.tags.join(' · ')}</p>}
        <p className="mt-auto pt-1 text-xs text-muted-foreground">{formatHistory(recipe)}</p>
      </div>
    </Link>
  )
}

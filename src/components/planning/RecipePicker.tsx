import { BookmarkCheck, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecipeSummary } from '@/lib/meals'
import { filterRecipes } from '@/lib/recipes'
import { cn } from '@/lib/utils'

interface Props {
  recipes: RecipeSummary[] | null
  value: string | null
  onChange: (id: string) => void
  invalid?: boolean
}

/** Liste filtrable des recettes sauvegardées (boutons radio). */
export function RecipePicker({ recipes, value, onChange, invalid }: Props) {
  const [query, setQuery] = useState('')
  const name = useId()
  const filtered = useMemo(
    () => filterRecipes((recipes ?? []).map((r) => ({ ...r, ingredientNames: [] })), query, null),
    [recipes, query],
  )

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Rechercher une recette"
          aria-label="Rechercher une recette"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 pl-8"
        />
      </div>
      <div
        role="radiogroup"
        aria-label="Recettes sauvegardées"
        aria-invalid={invalid || undefined}
        className={cn('max-h-56 overflow-y-auto rounded-lg border p-1', invalid && 'border-destructive')}
      >
        {recipes === null ? (
          <div className="space-y-1 p-1">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {recipes.length === 0 ? 'Aucune recette sauvegardée pour le moment.' : 'Aucune recette ne correspond.'}
          </p>
        ) : (
          filtered.map((recipe) => (
            <label
              key={recipe.id}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
                value === recipe.id && 'bg-muted font-medium',
              )}
            >
              <input
                type="radio"
                name={name}
                value={recipe.id}
                checked={value === recipe.id}
                onChange={() => onChange(recipe.id)}
                className="sr-only"
              />
              <BookmarkCheck className={cn('size-4 shrink-0', value === recipe.id ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
              <span className="flex-1 truncate">{recipe.title}</span>
              {recipe.tags.length > 0 && <span className="truncate text-xs text-muted-foreground">{recipe.tags.join(' · ')}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  )
}

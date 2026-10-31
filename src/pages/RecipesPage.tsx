import { BookOpen, ImageIcon, Images, Plus, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { collectTags, filterRecipes, type RecipeListItem } from '@/lib/recipes'
import { cn } from '@/lib/utils'

export function RecipesPage() {
  const api = useApi()
  const [recipes, setRecipes] = useState<RecipeListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api.recipes.listSavedRecipes().then(setRecipes, (e: unknown) => setError(errorMessage(e)))
  }, [api])

  useEffect(load, [load])

  const tags = useMemo(() => collectTags(recipes ?? []), [recipes])
  const visible = useMemo(() => filterRecipes(recipes ?? [], query, tag), [recipes, query, tag])
  const photoPaths = useMemo(() => (recipes ?? []).flatMap((r) => (r.mainPhotoPath ? [r.mainPhotoPath] : [])), [recipes])
  const urls = useSignedUrls(api, photoPaths)

  const newButton = (
    <Link to="/recettes/nouvelle" className={cn(buttonVariants(), 'h-10 px-4')}>
      <Plus /> Nouvelle recette
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Recettes"
        description="Vos recettes sauvegardées"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/recettes/import-serie" className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')} aria-label="Importer en série">
              <Images />
              <span className="max-sm:hidden">Importer en série</span>
            </Link>
            {newButton}
          </div>
        }
      />

      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{error}</p>
          <Button variant="outline" onClick={load}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : recipes === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Chargement des recettes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune recette"
          description="Créez une recette, ou sauvegardez une recette ponctuelle depuis le planning."
          action={newButton}
        />
      ) : (
        <>
          <div className="mb-5 space-y-3">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                placeholder="Rechercher par titre ou ingrédient"
                aria-label="Rechercher une recette"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 bg-background pl-9"
              />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par tag">
                {tags.map((t) => {
                  const active = tag === t
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTag(active ? null : t)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                        active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted',
                      )}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="Aucune recette ne correspond" description="Essayez un autre mot-clé ou retirez le filtre." />
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((recipe) => {
                const url = recipe.mainPhotoPath ? urls[recipe.mainPhotoPath] : undefined
                return (
                  <li key={recipe.id}>
                    <Link
                      to={`/recettes/${recipe.id}`}
                      className="group block overflow-hidden rounded-2xl border bg-background shadow-xs transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <div className="aspect-[4/3] bg-muted">
                        {url ? (
                          <img src={url} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <ImageIcon className="size-6 text-muted-foreground/50" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h2 className="font-medium tracking-tight">{recipe.title}</h2>
                        {recipe.tags.length > 0 && (
                          <p className="mt-1 truncate text-sm text-muted-foreground">{recipe.tags.join(' · ')}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}

import { BookOpen, Clock, Flame, History, ImageIcon, Images, Leaf, Plus, RefreshCw, Search, Star, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { todayIso, type IsoDate } from '@/lib/dates'
import {
  applyListOptions,
  collectBooks,
  DEFAULT_LIST_OPTIONS,
  formatHistory,
  formatKcal,
  formatRating,
  isVegetarianTag,
  QUICK_FILTERS,
  RECIPE_SORTS,
  readListOptions,
  writeListOptions,
  type QuickFilter,
  type RecipeListOptions,
  type RecipeSort,
} from '@/lib/recipeList'
import { collectTags, formatDuration, formatSource, type RecipeListItem } from '@/lib/recipes'
import { cn } from '@/lib/utils'

const selectClass =
  'h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-base md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30'

const QUICK_ICONS: Record<QuickFilter, typeof Timer> = { quick: Timer, vegetarian: Leaf, forgotten: History }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-3.5',
        active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

export function RecipesPage({ today = todayIso() }: { today?: IsoDate }) {
  const api = useApi()
  const [recipes, setRecipes] = useState<RecipeListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Recherche, filtres et tri dans l'adresse : au retour d'une fiche, la liste est comme on l'a laissée.
  const [params, setParams] = useSearchParams()
  const options = useMemo(() => readListOptions(params), [params])
  const setOptions = (patch: Partial<RecipeListOptions>) => setParams(writeListOptions({ ...options, ...patch }), { replace: true })

  const load = useCallback(() => {
    setError(null)
    api.recipes.listSavedRecipes(today).then(setRecipes, (e: unknown) => setError(errorMessage(e)))
  }, [api, today])

  useEffect(load, [load])

  const tags = useMemo(() => collectTags(recipes ?? []).filter((t) => !isVegetarianTag(t)), [recipes])
  const books = useMemo(() => collectBooks(recipes ?? []), [recipes])
  const visible = useMemo(() => applyListOptions(recipes ?? [], options, today), [recipes, options, today])
  const photoPaths = useMemo(() => (recipes ?? []).flatMap((r) => (r.mainPhotoPath ? [r.mainPhotoPath] : [])), [recipes])
  const urls = useSignedUrls(api, photoPaths)
  const filtered = options.query !== '' || options.tag !== null || options.book !== null || options.filters.length > 0

  function toggleFilter(filter: QuickFilter) {
    const active = options.filters.includes(filter)
    setOptions({ filters: active ? options.filters.filter((f) => f !== filter) : [...options.filters, filter] })
  }

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
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-0 flex-[1_1_16rem] sm:max-w-md">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Rechercher par titre ou ingrédient"
                  aria-label="Rechercher une recette"
                  value={options.query}
                  onChange={(e) => setOptions({ query: e.target.value })}
                  className="h-10 bg-background pl-9"
                />
              </div>
              <select
                aria-label="Trier les recettes"
                value={options.sort}
                onChange={(e) => setOptions({ sort: e.target.value as RecipeSort })}
                className={cn(selectClass, 'flex-[1_1_10rem] sm:flex-none')}
              >
                {RECIPE_SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {books.length > 0 && (
                <select
                  aria-label="Filtrer par livre"
                  value={options.book ?? ''}
                  onChange={(e) => setOptions({ book: e.target.value || null })}
                  className={cn(selectClass, 'flex-[1_1_10rem] sm:max-w-56 sm:flex-none', !options.book && 'text-muted-foreground')}
                >
                  <option value="">Tous les livres</option>
                  {/* Livre choisi absent de la liste (adresse ancienne) : affiché pour pouvoir le retirer. */}
                  {options.book && !books.includes(options.book) && <option value={options.book}>{options.book}</option>}
                  {books.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtres rapides">
              {QUICK_FILTERS.map(({ value, label }) => {
                const Icon = QUICK_ICONS[value]
                return (
                  <Chip key={value} active={options.filters.includes(value)} onClick={() => toggleFilter(value)}>
                    <Icon aria-hidden /> {label}
                  </Chip>
                )
              })}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par tag">
                {tags.map((t) => (
                  <Chip key={t} active={options.tag === t} onClick={() => setOptions({ tag: options.tag === t ? null : t })}>
                    {t}
                  </Chip>
                ))}
              </div>
            )}

            {filtered && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                {visible.length} recette{visible.length > 1 ? 's' : ''} sur {recipes.length}
                <Button variant="ghost" className="h-8 px-2" onClick={() => setParams(writeListOptions({ ...DEFAULT_LIST_OPTIONS, sort: options.sort }), { replace: true })}>
                  <X /> Effacer les filtres
                </Button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="Aucune recette ne correspond" description="Essayez un autre mot-clé ou retirez un filtre." />
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard recipe={recipe} photoUrl={recipe.mainPhotoPath ? urls[recipe.mainPhotoPath] : undefined} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

function RecipeCard({ recipe, photoUrl }: { recipe: RecipeListItem; photoUrl: string | undefined }) {
  const source = formatSource(recipe.source, recipe.sourcePage)
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
        {(recipe.totalMinutes !== null || kcal || recipe.rating !== null || recipe.vegetarian) && (
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

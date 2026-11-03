import { BookOpen, History, ImageOff, Images, Leaf, Link2, Loader2, Plus, RefreshCw, Search, Sprout, Timer, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { SetAsideList } from '@/components/recipes/SetAsideList'
import { PageHeader } from '@/components/Layout'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { applyAutoLinks, autoLinkMessage } from '@/lib/autoLinks'
import { todayIso, type IsoDate } from '@/lib/dates'
import { monthOf } from '@/lib/season'
import {
  applyListOptions,
  bookOrigin,
  collectOrigins,
  DEFAULT_LIST_OPTIONS,
  isVegetarianTag,
  MINE_ORIGIN,
  QUICK_FILTERS,
  RECIPE_SORTS,
  siteOrigin,
  readListOptions,
  writeListOptions,
  type QuickFilter,
  type RecipeListOptions,
  type RecipeSort,
} from '@/lib/recipeList'
import { collectTags, type RecipeListItem } from '@/lib/recipes'
import { cn } from '@/lib/utils'

const selectClass =
  'h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-base md:text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30'

const QUICK_ICONS: Record<QuickFilter, typeof Timer> = { quick: Timer, vegetarian: Leaf, seasonal: Sprout, forgotten: History, noPhoto: ImageOff }

/** Valeurs proposées dans le filtre par source. */
function optionValues(origins: ReturnType<typeof collectOrigins>): string[] {
  return [...(origins.mine ? [MINE_ORIGIN] : []), ...origins.books.map(bookOrigin), ...origins.sites.map(siteOrigin)]
}

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
  // Deux changements rapprochés (« Effacer les filtres » puis un tri) : le second part du premier, pas des options
  // encore affichées, sinon il remettrait les filtres effacés.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  }, [options])
  const setOptions = (patch: Partial<RecipeListOptions>) => {
    latest.current = { ...latest.current, ...patch }
    setParams(writeListOptions(latest.current), { replace: true })
  }

  const load = useCallback(() => {
    setError(null)
    api.recipes.listSavedRecipes(today).then(setRecipes, (e: unknown) => setError(errorMessage(e)))
  }, [api, today])

  useEffect(load, [load])

  const tags = useMemo(() => collectTags(recipes ?? []).filter((t) => !isVegetarianTag(t)), [recipes])
  const origins = useMemo(() => collectOrigins(recipes ?? []), [recipes])
  const visible = useMemo(() => applyListOptions(recipes ?? [], options, today), [recipes, options, today])
  const photoPaths = useMemo(() => (recipes ?? []).flatMap((r) => (r.mainPhotoPath ? [r.mainPhotoPath] : [])), [recipes])
  const urls = useSignedUrls(api, photoPaths)
  const filtered = options.query !== '' || options.tag !== null || options.origin !== null || options.filters.length > 0

  const [linking, setLinking] = useState(false)

  /** Lie entre elles les recettes d'un même livre (renvois « voir p. 208 ») : nouvelles comme déjà enregistrées. */
  async function linkBooks() {
    setLinking(true)
    try {
      const { linked, failed } = await applyAutoLinks(api)
      if (linked.length > 0) toast.success(autoLinkMessage(linked))
      else if (failed === 0) toast.info('Aucun nouveau lien : les renvois « voir p. … » sont déjà liés, ou leur page n’est pas encore importée')
      if (failed > 0) toast.error(`${failed} lien${failed > 1 ? 's' : ''} n’${failed > 1 ? 'ont' : 'a'} pas pu être créé${failed > 1 ? 's' : ''} : réessaie`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLinking(false)
    }
  }

  function toggleFilter(filter: QuickFilter) {
    const { filters } = latest.current
    setOptions({ filters: filters.includes(filter) ? filters.filter((f) => f !== filter) : [...filters, filter] })
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
        description="Tes recettes enregistrées"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 px-3" onClick={() => void linkBooks()} disabled={linking} aria-label="Relier les recettes">
              {linking ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 />}
              <span className="max-sm:hidden">Relier les recettes</span>
            </Button>
            <Link to="/recettes/saison" className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')} aria-label="De saison">
              <Sprout />
              <span className="max-sm:hidden">De saison</span>
            </Link>
            <Link to="/recettes/import-serie" className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')} aria-label="Importer en série">
              <Images />
              <span className="max-sm:hidden">Importer en série</span>
            </Link>
            {newButton}
          </div>
        }
      />

      <SetAsideList />

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
          description="Crée une recette, ou enregistre une recette ponctuelle depuis le planning."
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
              <select
                aria-label="Filtrer par source"
                value={options.origin ?? ''}
                onChange={(e) => setOptions({ origin: e.target.value || null })}
                className={cn(selectClass, 'flex-[1_1_10rem] sm:max-w-60 sm:flex-none', !options.origin && 'text-muted-foreground')}
              >
                <option value="">Toutes les sources</option>
                {origins.mine && <option value={MINE_ORIGIN}>Mes recettes (sans source)</option>}
                {origins.books.length > 0 && (
                  <optgroup label="Livres">
                    {origins.books.map((b) => (
                      <option key={b} value={bookOrigin(b)}>
                        {b}
                      </option>
                    ))}
                  </optgroup>
                )}
                {origins.sites.length > 0 && (
                  <optgroup label="Sites">
                    {origins.sites.map((site) => (
                      <option key={site} value={siteOrigin(site)}>
                        {site}
                      </option>
                    ))}
                  </optgroup>
                )}
                {/* Source choisie absente de la liste (adresse ancienne) : affichée pour pouvoir la retirer. */}
                {options.origin && !optionValues(origins).includes(options.origin) && <option value={options.origin}>{options.origin}</option>}
              </select>
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
                <Button variant="ghost" className="h-8 px-2" onClick={() => setOptions({ ...DEFAULT_LIST_OPTIONS, sort: latest.current.sort })}>
                  <X /> Effacer les filtres
                </Button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Search} title="Aucune recette ne correspond" description="Essaie un autre mot-clé ou retire un filtre." />
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard recipe={recipe} month={monthOf(today)} photoUrl={recipe.mainPhotoPath ? urls[recipe.mainPhotoPath] : undefined} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

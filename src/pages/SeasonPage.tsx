import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Sprout } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { RecipeCard } from '@/components/recipes/RecipeCard'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { todayIso, type IsoDate } from '@/lib/dates'
import type { RecipeListItem } from '@/lib/recipes'
import { MONTH_NAMES, monthOf, produceOfMonth, recipeSeason, type Produce } from '@/lib/season'
import { cn } from '@/lib/utils'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Fruits et légumes du mois (calendrier ADEME) et les recettes de saison ; un produit choisi montre ses recettes. */
export function SeasonPage({ today = todayIso() }: { today?: IsoDate }) {
  const api = useApi()
  const [recipes, setRecipes] = useState<RecipeListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Mois et produit dans l'adresse : au retour d'une fiche, la page est comme on l'a laissée.
  const [params, setParams] = useSearchParams()
  const current = monthOf(today)
  const asked = Number(params.get('mois'))
  const month = Number.isInteger(asked) && asked >= 1 && asked <= 12 ? asked : current
  const selected = params.get('produit')

  const load = useCallback(() => {
    setError(null)
    api.recipes.listSavedRecipes(today).then(setRecipes, (e: unknown) => setError(errorMessage(e)))
  }, [api, today])

  useEffect(load, [load])

  const produce = useMemo(() => produceOfMonth(month), [month])
  // Recettes de saison ce mois-là, et recettes de chaque fruit ou légume.
  const { inSeason, bySlug } = useMemo(() => {
    const bySlug = new Map<string, RecipeListItem[]>()
    const inSeason: RecipeListItem[] = []
    for (const recipe of recipes ?? []) {
      const season = recipeSeason(recipe.ingredientNames, month)
      if (season.status === 'in') inSeason.push(recipe)
      for (const p of season.produce) bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), recipe])
    }
    return { inSeason, bySlug }
  }, [recipes, month])
  const uses = (p: Produce) => bySlug.get(p.slug) ?? []
  const chosen = produce.find((p) => p.slug === selected) ?? null
  const shown = chosen ? uses(chosen) : inSeason
  // Toutes les photos d'un coup : changer de mois ou de produit ne les redemande pas.
  const photoPaths = useMemo(() => (recipes ?? []).flatMap((r) => (r.mainPhotoPath ? [r.mainPhotoPath] : [])), [recipes])
  const urls = useSignedUrls(api, photoPaths)

  const setMonth = (value: number) => {
    const next = ((value - 1 + 12) % 12) + 1
    setParams(next === current ? {} : { mois: String(next) }, { replace: true })
  }
  const choose = (slug: string | null) => {
    const next = new URLSearchParams(params)
    if (slug) next.set('produit', slug)
    else next.delete('produit')
    setParams(next, { replace: true })
  }
  const monthName = MONTH_NAMES[month - 1]

  return (
    <>
      <Link to="/recettes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recettes
      </Link>
      <PageHeader title="De saison" description="Fruits et légumes de saison en France, d’après le calendrier de l’ADEME." />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-lg" aria-label="Mois précédent" onClick={() => setMonth(month - 1)}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-32 text-center text-xl font-semibold tracking-tight" aria-live="polite">
          {capitalize(monthName)}
        </h2>
        <Button variant="outline" size="icon-lg" aria-label="Mois suivant" onClick={() => setMonth(month + 1)}>
          <ChevronRight />
        </Button>
        {month !== current && (
          <Button variant="ghost" className="h-9 px-2" onClick={() => setMonth(current)}>
            Revenir à {MONTH_NAMES[current - 1]}
          </Button>
        )}
      </div>

      <div className="mb-8 space-y-4">
        {(['légume', 'fruit'] as const).map((kind) => {
          const items = produce.filter((p) => p.kind === kind)
          if (items.length === 0) return null
          return (
            <section key={kind} aria-labelledby={`season-${kind}`}>
              <h3 id={`season-${kind}`} className="mb-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                {kind === 'légume' ? 'Légumes' : 'Fruits'}
              </h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label={kind === 'légume' ? 'Légumes du mois' : 'Fruits du mois'}>
                {items.map((p) => {
                  const count = recipes ? uses(p).length : null
                  const active = chosen?.slug === p.slug
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(active ? null : p.slug)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                        active ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted',
                      )}
                    >
                      {p.name}
                      {count !== null && count > 0 && <span className={cn('tabular-nums', !active && 'text-muted-foreground')}>· {count}</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section aria-labelledby="season-recipes">
        <h2 id="season-recipes" className="mb-3 font-semibold tracking-tight">
          {chosen ? `Recettes avec : ${chosen.name.toLowerCase()}` : `Recettes de saison en ${monthName}`}
          {recipes && <span className="ml-2 font-normal text-muted-foreground tabular-nums">{shown.length}</span>}
        </h2>
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
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Sprout}
            title={chosen ? 'Aucune recette avec ce produit' : 'Aucune recette de saison'}
            description={chosen ? 'Choisis un autre fruit ou légume.' : 'Une recette est de saison quand tous ses fruits et légumes le sont.'}
          />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((recipe) => (
              <li key={recipe.id}>
                <RecipeCard recipe={recipe} month={month} photoUrl={recipe.mainPhotoPath ? urls[recipe.mainPhotoPath] : undefined} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

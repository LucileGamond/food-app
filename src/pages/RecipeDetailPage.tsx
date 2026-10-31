import { ArrowLeft, BookOpen, Clock, ExternalLink, Flame, History, Inbox, Minus, Pencil, Plus, RefreshCw, SearchX, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LinkifiedText } from '@/components/LinkifiedText'
import { LinkRecipeDialog } from '@/components/recipes/LinkRecipeDialog'
import { LinkedRecipesOffer } from '@/components/recipes/LinkedRecipesOffer'
import { RecipeReviews } from '@/components/recipes/RecipeReviews'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import type { RecipeUsages } from '@/api/recipes'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { formatDay } from '@/lib/dates'
import { slotLabel } from '@/lib/meals'
import { formatHistory } from '@/lib/recipeList'
import {
  DURATION_FIELDS,
  formatDuration,
  formatIngredient,
  formatNutrition,
  formatSource,
  groupBySection,
  linkedImportPath,
  pendingLinks,
  scaleIngredients,
  SERVINGS_MAX,
  type LinkedRecipe,
  type PendingLink,
  type Recipe,
  type RecipeHistory,
} from '@/lib/recipes'
import { cn } from '@/lib/utils'

export function RecipeDetailPage() {
  const { id = '' } = useParams()
  // Une recette liée s'ouvre sur la même page : tout l'état (photo affichée, fenêtres…) repart de zéro.
  return <RecipeDetail key={id} id={id} />
}

function RecipeDetail({ id }: { id: string }) {
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [usages, setUsages] = useState<RecipeUsages | null>(null)
  // Nombre de personnes choisi pour adapter les quantités (non enregistré).
  const [people, setPeople] = useState<{ recipeId: string; value: number } | null>(null)
  // Juste après l'enregistrement : proposer d'importer ou de lier les recettes auxquelles elle renvoie.
  const offerRequested = Boolean((location.state as { offerLinks?: boolean } | null)?.offerLinks)
  const [offerDismissed, setOfferDismissed] = useState<string | null>(null)
  const [linking, setLinking] = useState<PendingLink | null>(null)
  const closeLinking = useCallback(() => setLinking(null), [])

  // Historique (repas du planning) : secondaire, rien ne s'affiche s'il ne se charge pas.
  const [history, setHistory] = useState<RecipeHistory | null>(null)

  const load = useCallback(() => {
    setError(null)
    api.recipes.getRecipe(id).then(setRecipe, (e: unknown) => setError(errorMessage(e)))
    api.recipes.getHistory(id).then(setHistory, () => setHistory(null))
  }, [api, id])

  useEffect(load, [load])

  const paths = useMemo(() => recipe?.photos.map((p) => p.storage_path) ?? [], [recipe])
  const urls = useSignedUrls(api, paths)

  async function addToInbox() {
    if (!recipe) return
    try {
      await api.inbox.addItem({ recipeId: recipe.id })
      toast.success('Ajoutée à la liste « À planifier »')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function openDelete() {
    setUsages(null)
    setDeleteOpen(true)
    api.recipes.listUsages(id).then(setUsages, (e: unknown) => {
      setDeleteOpen(false)
      toast.error(errorMessage(e))
    })
  }

  async function link(reference: PendingLink, linked: LinkedRecipe) {
    await api.recipes.linkIngredient(id, reference, linked.id)
    setRecipe((current) =>
      current ? { ...current, ingredients: current.ingredients.map((i, position) => (position === reference.position ? { ...i, linkedRecipe: linked } : i)) } : current,
    )
    toast.success(`« ${reference.name} » renvoie maintenant à « ${linked.title} »`)
  }

  async function confirmDelete() {
    try {
      await api.recipes.deleteRecipe(id)
      toast.success('Recette supprimée')
      navigate('/recettes', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" onClick={load}>
          <RefreshCw /> Réessayer
        </Button>
      </div>
    )
  }

  if (recipe === undefined) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la recette">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="aspect-[16/9] rounded-2xl" />
      </div>
    )
  }

  if (recipe === null || !recipe.is_saved) {
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

  const mainUrl = recipe.photos[activePhoto] ? urls[recipe.photos[activePhoto].storage_path] : undefined
  const inPlanning = (usages?.meals.length ?? 0) > 0
  const inRecipes = (usages?.recipes.length ?? 0) > 0
  const inUse = inPlanning || inRecipes
  const baseServings = recipe.servings
  const servings = baseServings === null ? null : people?.recipeId === recipe.id ? people.value : baseServings
  const ingredients = (baseServings !== null && servings !== null ? scaleIngredients(recipe.ingredients, baseServings, servings) : recipe.ingredients).map(
    (ingredient, position) => ({ ...ingredient, position }),
  )
  const pending = pendingLinks(recipe.ingredients)
  const pendingAt = new Map(pending.map((p) => [p.position, p]))
  const importLinked = (reference: PendingLink) => navigate(linkedImportPath(recipe.id, reference))
  const times = DURATION_FIELDS.flatMap(({ label, column }) => (recipe[column] ? [`${label} ${formatDuration(recipe[column])}`] : []))
  const setServings = (value: number) => setPeople({ recipeId: recipe.id, value: Math.min(SERVINGS_MAX, Math.max(1, value)) })

  return (
    <article>
      <Link to="/recettes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recettes
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{recipe.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {recipe.servings !== null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-4" aria-hidden /> {recipe.servings} {recipe.servings > 1 ? 'portions' : 'portion'}
              </span>
            )}
            {times.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden /> {times.join(' · ')}
              </span>
            )}
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          {formatNutrition(recipe) && (
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <Flame className="size-4" aria-hidden /> {formatNutrition(recipe)}
            </p>
          )}
          {formatSource(recipe.source, recipe.source_page) && (
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <BookOpen className="size-4" aria-hidden /> {formatSource(recipe.source, recipe.source_page)}
            </p>
          )}
          {history && (
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <History className="size-4" aria-hidden /> {formatHistory(history)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 px-3" onClick={() => void addToInbox()}>
            <Inbox /> À planifier
          </Button>
          <Link to={`/recettes/${recipe.id}/modifier`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')}>
            <Pencil /> Modifier
          </Link>
          <Button variant="destructive" className="h-10 px-3" onClick={openDelete}>
            <Trash2 /> Supprimer
          </Button>
        </div>
      </div>

      {recipe.photos.length > 0 && (
        <div className="mb-8 space-y-3">
          <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-muted">
            {mainUrl && <img src={mainUrl} alt={recipe.title} className="size-full object-cover" />}
          </div>
          {recipe.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {recipe.photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setActivePhoto(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-pressed={i === activePhoto}
                  className={cn('size-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-page', i === activePhoto && 'ring-2 ring-foreground')}
                >
                  {urls[photo.storage_path] && <img src={urls[photo.storage_path]} alt="" className="size-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section aria-labelledby="ingredients-title" className="rounded-2xl border bg-background p-5 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ingredients-title" className="font-semibold tracking-tight">
              Ingrédients
            </h2>
            {servings !== null && (
              <div className="flex items-center gap-1" role="group" aria-label="Nombre de personnes">
                <Button variant="outline" size="icon" aria-label="Une personne de moins" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
                  <Minus />
                </Button>
                <span className="min-w-24 text-center text-sm tabular-nums" aria-live="polite">
                  {servings} {servings > 1 ? 'personnes' : 'personne'}
                </span>
                <Button variant="outline" size="icon" aria-label="Une personne de plus" disabled={servings >= SERVINGS_MAX} onClick={() => setServings(servings + 1)}>
                  <Plus />
                </Button>
              </div>
            )}
          </div>
          {servings !== null && servings !== baseServings && (
            <p className="mb-2 text-xs text-muted-foreground">
              Quantités adaptées (recette pour {baseServings}).{' '}
              <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setServings(baseServings!)}>
                Revenir à {baseServings}
              </button>
            </p>
          )}
          {groupBySection(ingredients).map((group, g) => (
            <div key={g} className={cn(g > 0 && 'mt-4')}>
              {group.section && <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.section}</h3>}
              <ul className="divide-y text-sm">
                {group.items.map((ingredient) => {
                  const reference = pendingAt.get(ingredient.position)
                  return (
                    <li key={ingredient.position} className="py-2">
                      {formatIngredient(ingredient)}
                      {ingredient.linkedRecipe ? (
                        <Link
                          to={`/recettes/${ingredient.linkedRecipe.id}`}
                          className="mt-0.5 flex w-fit items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline"
                        >
                          <BookOpen className="size-3.5" aria-hidden /> Recette : {ingredient.linkedRecipe.title}
                        </Link>
                      ) : (
                        reference && (
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            Recette {reference.page}
                            <button type="button" className="font-medium text-brand underline-offset-4 hover:underline" aria-label={`Importer ${reference.name}`} onClick={() => importLinked(reference)}>
                              Importer
                            </button>
                            <button type="button" className="font-medium text-brand underline-offset-4 hover:underline" aria-label={`Lier ${reference.name} à une recette existante`} onClick={() => setLinking(reference)}>
                              Lier
                            </button>
                          </span>
                        )
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="steps-title">
          <h2 id="steps-title" className="mb-3 font-semibold tracking-tight">Préparation</h2>
          {recipe.notes ? (
            <LinkifiedText text={recipe.notes} className="block text-sm leading-relaxed" />
          ) : (
            <p className="text-sm text-muted-foreground">Aucune étape renseignée.</p>
          )}
          {recipe.url && (
            <a
              href={recipe.url}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-5 h-10 px-3')}
            >
              <ExternalLink /> Voir la recette en ligne
            </a>
          )}
        </section>
      </div>

      <RecipeReviews recipeId={recipe.id} reviews={recipe.reviews ?? []} onSaved={(reviews) => setRecipe({ ...recipe, reviews })} />

      <LinkedRecipesOffer
        open={offerRequested && offerDismissed !== location.key && linking === null}
        references={pending}
        onOpenChange={(open) => !open && setOfferDismissed(location.key)}
        onImport={importLinked}
        onLink={setLinking}
      />
      <LinkRecipeDialog reference={linking} recipeId={recipe.id} onClose={closeLinking} onLink={link} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={inUse ? 'Suppression impossible' : 'Supprimer cette recette ?'}
        description={
          usages === null
            ? 'Vérification du planning et des recettes…'
            : inPlanning && inRecipes
              ? 'Cette recette est utilisée dans le planning et dans d’autres recettes. Retirez-la de ces repas et de ces recettes pour pouvoir la supprimer :'
              : inPlanning
                ? 'Cette recette est utilisée dans le planning. Retirez-la de ces repas pour pouvoir la supprimer :'
                : inRecipes
                  ? 'Cette recette est utilisée dans d’autres recettes. Retirez-y le lien (dans « Modifier ») pour pouvoir la supprimer :'
                  : `« ${recipe.title} » et ses photos seront définitivement supprimées.`
        }
        confirmLabel="Supprimer"
        confirmDisabled={usages === null || inUse}
        onConfirm={confirmDelete}
      >
        {usages && inUse && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3 text-sm">
            {usages.recipes.map((r) => (
              <li key={r.id}>
                <Link to={`/recettes/${r.id}`} className="inline-flex items-center gap-1 font-medium text-brand underline-offset-4 hover:underline">
                  <BookOpen className="size-3.5" aria-hidden /> {r.title}
                </Link>
              </li>
            ))}
            {usages.meals.map((u, i) => (
              <li key={i}>
                {formatDay(u.meal_date)} · {slotLabel(u.slot)}
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </article>
  )
}

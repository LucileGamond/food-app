import { ArrowLeft, ExternalLink, Pencil, RefreshCw, SearchX, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LinkifiedText } from '@/components/LinkifiedText'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import type { RecipeUsage } from '@/api/recipes'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { formatDay } from '@/lib/dates'
import { slotLabel } from '@/lib/meals'
import { formatIngredient, type Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

export function RecipeDetailPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [usages, setUsages] = useState<RecipeUsage[] | null>(null)

  const load = useCallback(() => {
    setError(null)
    api.recipes.getRecipe(id).then(setRecipe, (e: unknown) => setError(errorMessage(e)))
  }, [api, id])

  useEffect(load, [load])

  const paths = useMemo(() => recipe?.photos.map((p) => p.storage_path) ?? [], [recipe])
  const urls = useSignedUrls(api, paths)

  function openDelete() {
    setUsages(null)
    setDeleteOpen(true)
    api.recipes.listUsages(id).then(setUsages, (e: unknown) => {
      setDeleteOpen(false)
      toast.error(errorMessage(e))
    })
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
  const inUse = usages !== null && usages.length > 0

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
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
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
          <h2 id="ingredients-title" className="mb-3 font-semibold tracking-tight">Ingrédients</h2>
          <ul className="divide-y text-sm">
            {recipe.ingredients.map((ingredient, i) => (
              <li key={i} className="py-2">
                {formatIngredient(ingredient)}
              </li>
            ))}
          </ul>
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={inUse ? 'Suppression impossible' : 'Supprimer cette recette ?'}
        description={
          usages === null
            ? 'Vérification du planning…'
            : inUse
              ? 'Cette recette est utilisée dans le planning. Retirez-la de ces repas pour pouvoir la supprimer :'
              : `« ${recipe.title} » et ses photos seront définitivement supprimées.`
        }
        confirmLabel="Supprimer"
        confirmDisabled={usages === null || inUse}
        onConfirm={confirmDelete}
      >
        {inUse && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-3 text-sm">
            {usages.map((u, i) => (
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

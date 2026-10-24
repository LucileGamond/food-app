import { ArrowLeft, ArrowRightLeft, CopyCheck, Loader2, SearchX } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/EmptyState'
import { IngredientsEditor } from '@/components/recipes/IngredientsEditor'
import { PhotoUploader, type PhotoDraft } from '@/components/recipes/PhotoUploader'
import { RecipeImportCard } from '@/components/recipes/RecipeImportCard'
import { TagInput } from '@/components/recipes/TagInput'
import { useApi } from '@/app/ApiContext'
import { DuplicateRecipeUrlError, errorMessage } from '@/api'
import { isValidUrl } from '@/lib/meals'
import { compressImage } from '@/lib/image'
import {
  formHasContent,
  hasErrors,
  importedImageToFile,
  importedToFormValues,
  recipeToFormValues,
  toSaveRecipeInput,
  validateRecipeForm,
  type RecipeFormValues,
} from '@/lib/recipes'
import { cn } from '@/lib/utils'

const EMPTY: RecipeFormValues = recipeToFormValues({ title: '', servings: null, notes: null, url: null, tags: [] })

function Field({ id, label, error, hint, children }: { id?: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function RecipeFormPage() {
  const { id } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound'>(id ? 'loading' : 'ready')
  const [wasSaved, setWasSaved] = useState(!id)
  const [values, setValues] = useState<RecipeFormValues>(EMPTY)
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [removed, setRemoved] = useState<PhotoDraft[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  // Recette sauvegardée qui a déjà le même lien (le lien est unique parmi les recettes sauvegardées).
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null)
  const [switching, setSwitching] = useState(false)
  const savedId = useRef<string | null>(id ?? null)
  const keyCounter = useRef(0)

  useEffect(() => {
    api.recipes.listTags().then(setTagSuggestions, () => setTagSuggestions([]))
  }, [api])

  // Vérifie, peu après la saisie, si le lien est déjà celui d'une autre recette sauvegardée.
  const url = values.url.trim()
  useEffect(() => {
    if (status !== 'ready' || !isValidUrl(url)) {
      setDuplicate(null)
      return
    }
    let active = true
    const timer = setTimeout(() => {
      api.recipes.findSavedByUrl(url, savedId.current).then(
        (existing) => active && setDuplicate(existing),
        () => undefined,
      )
    }, 400)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [api, url, status])

  useEffect(() => {
    if (!id) return
    let active = true
    api.recipes.getRecipe(id).then(
      async (recipe) => {
        if (!active) return
        if (!recipe) return setStatus('notFound')
        setValues(recipeToFormValues(recipe))
        setWasSaved(recipe.is_saved)
        const urls = await api.photos.signedUrls(recipe.photos.map((p) => p.storage_path)).catch(() => ({}) as Record<string, string>)
        if (!active) return
        setPhotos(recipe.photos.map((p) => ({ kind: 'existing', key: p.id, id: p.id, storage_path: p.storage_path, url: urls[p.storage_path] })))
        setStatus('ready')
      },
      (e: unknown) => {
        if (!active) return
        toast.error(errorMessage(e))
        setStatus('notFound')
      },
    )
    return () => {
      active = false
    }
  }, [api, id])

  // Libère les aperçus locaux des nouvelles photos.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => p.kind === 'new' && URL.revokeObjectURL(p.url)), [])

  const errors = validateRecipeForm(values)
  const shown = submitted ? errors : {}
  const set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  function addPhotos(files: File[]) {
    setPhotos((list) => [
      ...list,
      ...files.map((file) => ({ kind: 'new' as const, key: `new-${++keyCounter.current}`, file, url: URL.createObjectURL(file) })),
    ])
  }

  /** Préremplit le formulaire depuis une page de recette (et ajoute sa photo s'il n'y en a pas encore). */
  async function importFromUrl(url: string) {
    // Recette déjà enregistrée : inutile de l'analyser (et de consommer des tokens).
    const existing = await api.recipes.findSavedByUrl(url, savedId.current)
    if (existing) {
      setDuplicate(existing)
      throw new DuplicateRecipeUrlError(existing)
    }
    const result = await api.recipes.importFromUrl(url, tagSuggestions)
    setValues(importedToFormValues(result.recipe, url))
    setSubmitted(false)
    if (result.image && photos.length === 0) addPhotos([importedImageToFile(result.image)])
  }

  function removePhoto(key: string) {
    const photo = photos.find((p) => p.key === key)
    if (!photo) return
    if (photo.kind === 'existing') setRemoved((r) => [...r, photo])
    else URL.revokeObjectURL(photo.url)
    setPhotos((list) => list.filter((p) => p.key !== key))
  }

  function makeMain(key: string) {
    setPhotos((list) => {
      const photo = list.find((p) => p.key === key)
      return photo ? [photo, ...list.filter((p) => p.key !== key)] : list
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (hasErrors(errors)) {
      toast.error('Vérifie les champs en rouge.')
      return
    }
    if (duplicate) {
      toast.error(new DuplicateRecipeUrlError(duplicate).message)
      return
    }
    setSaving(true)
    try {
      const recipeId = await api.recipes.saveRecipe(toSaveRecipeInput(savedId.current, values))
      savedId.current = recipeId

      for (const photo of removed) if (photo.kind === 'existing') await api.photos.deletePhoto(photo)
      setRemoved([])

      // Envoie les nouvelles photos une par une ; chaque photo envoyée devient « existante »
      // pour ne pas être renvoyée si l'enregistrement est relancé après une erreur.
      const finalIds: string[] = []
      for (const photo of photos) {
        if (photo.kind === 'existing') {
          finalIds.push(photo.id)
          continue
        }
        const uploaded = await api.photos.uploadPhoto(recipeId, await compressImage(photo.file))
        finalIds.push(uploaded.id)
        setPhotos((list) =>
          list.map((p) => (p.key === photo.key ? { kind: 'existing', key: p.key, id: uploaded.id, storage_path: uploaded.storage_path, url: p.url } : p)),
        )
      }
      if (finalIds.length > 1) await api.photos.reorderPhotos(finalIds)

      toast.success(wasSaved ? 'Recette enregistrée' : 'Recette sauvegardée')
      navigate(from ?? `/recettes/${recipeId}`, { replace: true })
    } catch (e) {
      if (e instanceof DuplicateRecipeUrlError) setDuplicate(e.existing)
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  /** Recette ponctuelle du planning : les repas passent sur la recette déjà enregistrée. */
  async function switchToExisting() {
    if (!id || !duplicate) return
    setSwitching(true)
    try {
      await api.recipes.useSavedRecipe(id, duplicate.id)
      toast.success(`Le planning utilise maintenant « ${duplicate.title} »`)
      navigate(from ?? '/planning', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setSwitching(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la recette">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (status === 'notFound') {
    return (
      <EmptyState
        icon={SearchX}
        title="Recette introuvable"
        action={
          <Link to="/recettes" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            Retour aux recettes
          </Link>
        }
      />
    )
  }

  const title = !id ? 'Nouvelle recette' : wasSaved ? 'Modifier la recette' : 'Sauvegarder la recette'
  const backTo = from ?? (id && wasSaved ? `/recettes/${id}` : '/recettes')

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-3xl">
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Retour
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{title}</h1>
      {!wasSaved && (
        <p className="mb-6 text-sm text-muted-foreground">Complétez la recette pour la retrouver dans l'écran Recettes.</p>
      )}

      <div className="mt-6 space-y-8">
        {(!id || !wasSaved) && <RecipeImportCard initialUrl={values.url} hasContent={formHasContent(values)} onImport={importFromUrl} />}

        {duplicate && (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CopyCheck className="size-4 shrink-0 text-destructive" aria-hidden />
              Cette recette est déjà enregistrée : « {duplicate.title} »
            </p>
            <p className="mt-1 text-muted-foreground">
              {id && !wasSaved
                ? 'Le planning peut utiliser cette recette à la place de la recette ponctuelle.'
                : 'Un même lien ne peut être utilisé que par une seule recette.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {id && !wasSaved && (
                <Button type="button" className="h-10 px-4" disabled={switching} onClick={() => void switchToExisting()}>
                  {switching ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRightLeft aria-hidden />}
                  Utiliser « {duplicate.title} » dans le planning
                </Button>
              )}
              <Link to={`/recettes/${duplicate.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-4')}>
                Ouvrir « {duplicate.title} »
              </Link>
            </div>
          </div>
        )}

        <section className="space-y-5 rounded-2xl border bg-background p-5 shadow-xs">
          <Field id="recipe-title" label="Titre" error={shown.title}>
            <Input
              id="recipe-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              aria-invalid={Boolean(shown.title) || undefined}
              className="h-10"
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
            <Field id="recipe-servings" label="Portions" error={shown.servings}>
              <Input
                id="recipe-servings"
                inputMode="numeric"
                value={values.servings}
                onChange={(e) => set('servings', e.target.value)}
                aria-invalid={Boolean(shown.servings) || undefined}
                className="h-10"
              />
            </Field>
            <Field id="recipe-url" label="Lien" error={shown.url ?? (duplicate ? 'Lien déjà utilisé par une autre recette' : undefined)}>
              <Input
                id="recipe-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={values.url}
                onChange={(e) => set('url', e.target.value)}
                aria-invalid={Boolean(shown.url || duplicate) || undefined}
                className="h-10"
              />
            </Field>
          </div>
          <Field id="recipe-tags" label="Tags" hint="Ex. végé, rapide, dessert">
            <TagInput id="recipe-tags" value={values.tags} suggestions={tagSuggestions} onChange={(tags) => set('tags', tags)} />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="font-semibold tracking-tight">Ingrédients</h2>
          <IngredientsEditor rows={values.ingredients} errors={shown.ingredientRows} onChange={(rows) => set('ingredients', rows)} />
          {shown.ingredients && <p className="text-sm text-destructive">{shown.ingredients}</p>}
        </section>

        <section className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs">
          <Field id="recipe-notes" label="Préparation">
            <Textarea id="recipe-notes" rows={8} value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Étapes de la recette…" />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs" aria-labelledby="photos-heading">
          <h2 id="photos-heading" className="font-semibold tracking-tight">Photos</h2>
          <PhotoUploader photos={photos} onAdd={addPhotos} onRemove={removePhoto} onMakeMain={makeMain} />
        </section>
      </div>

      <div className="sticky bottom-20 mt-8 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        <Link to={backTo} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-4', saving && 'pointer-events-none opacity-50')}>
          Annuler
        </Link>
        <Button type="submit" className="h-10 px-4" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {wasSaved ? 'Enregistrer' : 'Sauvegarder la recette'}
        </Button>
      </div>
    </form>
  )
}

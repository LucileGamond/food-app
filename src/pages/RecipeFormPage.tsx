import { ArrowLeft, ArrowRightLeft, BookOpen, CopyCheck, Link2, Loader2, SearchX } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/EmptyState'
import { IngredientsEditor } from '@/components/recipes/IngredientsEditor'
import { PhotoUploader, type PhotoDraft } from '@/components/recipes/PhotoUploader'
import { CheckNote } from '@/components/recipes/CheckNote'
import { ImportReview } from '@/components/recipes/ImportReview'
import { RecipeImportCard } from '@/components/recipes/RecipeImportCard'
import { SourceInput } from '@/components/recipes/SourceInput'
import { TagInput } from '@/components/recipes/TagInput'
import { useApi } from '@/app/ApiContext'
import { AppError, DuplicateRecipeUrlError, errorMessage } from '@/api'
import { isValidUrl } from '@/lib/meals'
import { compressForReading, compressImage } from '@/lib/image'
import { importChecks, pendingChecks, type ImportCheck } from '@/lib/importChecks'
import { takeSharedPhotos } from '@/lib/sharedPhotos'
import {
  formHasContent,
  DURATION_FIELDS,
  hasErrors,
  importedImageToFile,
  importedToFormValues,
  linkedSource,
  linkedTitle,
  MACRO_FIELDS,
  NUTRITION_BASES,
  type NutritionBasis,
  parseLinkedImport,
  recipeToFormValues,
  toSaveRecipeInput,
  validateRecipeForm,
  type ImportedRecipe,
  type RecipeFormValues,
} from '@/lib/recipes'
import { normalizeName } from '@/lib/shopping'
import { findSource } from '@/lib/sources'
import { cn } from '@/lib/utils'

const EMPTY: RecipeFormValues = recipeToFormValues({ title: '', servings: null, notes: null, url: null, tags: [] })

function Field({
  id,
  label,
  error,
  hint,
  checks = [],
  children,
}: {
  id?: string
  label: string
  error?: string
  hint?: string
  /** Points à vérifier après un import. */
  checks?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {checks.map((message) => (
        <CheckNote key={message} message={message} />
      ))}
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
  const [searchParams, setSearchParams] = useSearchParams()
  // Photos partagées depuis la galerie du téléphone (voir public/share-sw.js).
  const [sharedPhotos, setSharedPhotos] = useState<File[] | undefined>(undefined)

  const [status, setStatus] = useState<'loading' | 'ready' | 'notFound'>(id ? 'loading' : 'ready')
  const [wasSaved, setWasSaved] = useState(!id)
  // Sous-recette d'un ingrédient (« pâte sucrée, voir p. 208 »), ouverte depuis la recette principale.
  const [linkTarget, setLinkTarget] = useState(() => (id ? null : parseLinkedImport(searchParams)))
  const [parent, setParent] = useState<{ title: string } | null>(null)
  const [values, setValues] = useState<RecipeFormValues>(() =>
    linkTarget ? { ...EMPTY, title: linkedTitle(linkTarget.reference.name) } : EMPTY,
  )
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [removed, setRemoved] = useState<PhotoDraft[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [savedTitles, setSavedTitles] = useState<{ id: string; title: string }[]>([])
  // Photos lues lors d'un import, gardées à l'écran (sans être enregistrées) pour vérifier le formulaire.
  const [readPages, setReadPages] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  // Recette sauvegardée qui a déjà le même lien (le lien est unique parmi les recettes sauvegardées).
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null)
  const [switching, setSwitching] = useState(false)
  // Points à vérifier après un import, et le formulaire tel que l'import l'a rempli (pour savoir ce qui a été corrigé).
  // Recettes lues sur une même photo, en attendant que la personne choisisse celle à préremplir.
  const [pageRecipes, setPageRecipes] = useState<ImportedRecipe[] | null>(null)
  const [review, setReview] = useState<{ checks: ImportCheck[]; snapshot: RecipeFormValues } | null>(null)
  const savedId = useRef<string | null>(id ?? null)
  const keyCounter = useRef(0)

  useEffect(() => {
    api.recipes.listTags().then(setTagSuggestions, () => setTagSuggestions([]))
    api.recipes.listSources().then(setSources, () => setSources([]))
    api.recipes.listSavedSummaries().then(setSavedTitles, () => setSavedTitles([]))
  }, [api])

  useEffect(() => {
    if (!linkTarget) return
    let active = true
    api.recipes.getRecipe(linkTarget.parentId).then(
      (recipe) => {
        if (!active) return
        // Recette principale supprimée entre-temps : la sous-recette devient une recette comme une autre.
        if (!recipe?.is_saved) return setLinkTarget(null)
        setParent({ title: recipe.title })
        const linked = linkedSource(recipe.source, linkTarget.reference.page)
        setValues((v) => ({ ...v, source: v.source || linked.source, page: v.page || linked.page }))
      },
      // Hors ligne : le lien sera tenté à l'enregistrement (et reproposé s'il échoue).
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [api, linkTarget])

  // Recette déjà enregistrée sous le même titre (sans accents ni majuscules) : utile surtout après un import.
  const sameTitle = values.title.trim()
    ? (savedTitles.find((r) => r.id !== id && normalizeName(r.title) === normalizeName(values.title)) ?? null)
    : null

  const fromShare = !id && searchParams.get('photos') === 'partage'
  const sharedTaken = useRef(false)
  useEffect(() => {
    // Une seule lecture, même si l'effet est rejoué (mode strict) : la seconde trouverait le cache vide.
    if (!fromShare || sharedTaken.current) return
    sharedTaken.current = true
    void takeSharedPhotos().then((files) => {
      setSharedPhotos(files)
      if (files.length === 0) toast.error('Aucune photo reçue : choisis-la depuis « Photo d’un livre ou scan ».')
      setSearchParams({}, { replace: true })
    })
  }, [fromShare, setSearchParams])

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
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const readPagesRef = useRef(readPages)
  useEffect(() => {
    readPagesRef.current = readPages
  }, [readPages])
  useEffect(() => () => readPagesRef.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const toCheck = review ? pendingChecks(review.checks, review.snapshot, values) : []
  const flags: Record<string, string[]> = {}
  for (const check of toCheck) if (check.ingredientKey) (flags[check.ingredientKey] ??= []).push(check.message)
  const fieldChecks = (field: ImportCheck['field']) => toCheck.filter((c) => !c.ingredientKey && c.field === field).map((c) => c.message)

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
    applyImport(result.recipe, url)
    if (result.image && photos.length === 0) addPhotos([importedImageToFile(result.image)])
  }

  /** Préremplit le formulaire en lisant la recette sur 1 ou 2 photos (page de livre, scan). La photo n'est pas gardée. */
  async function importFromPhotos(files: File[]): Promise<boolean> {
    let photos: Blob[]
    try {
      photos = await Promise.all(files.map(compressForReading))
    } catch {
      // Format que le navigateur ne sait pas lire (HEIC d'iPhone…) ou fichier abîmé.
      throw new AppError('Cette photo ne peut pas être lue. Essaie une photo JPEG ou PNG (ou une capture d’écran).')
    }
    // À l'ouverture depuis un partage, les tags existants ne sont peut-être pas encore chargés.
    const tags = tagSuggestions.length > 0 ? tagSuggestions : await api.recipes.listTags().catch(() => [] as string[])
    const result = await api.recipes.importFromPhotos(photos, tags)
    if (!mounted.current) return false
    setReadPages((previous) => {
      previous.forEach((url) => URL.revokeObjectURL(url))
      return files.map((file) => URL.createObjectURL(file))
    })
    // Plusieurs recettes sur la page : on demande laquelle préremplir.
    if (result.recipes && result.recipes.length > 1) {
      setPageRecipes(result.recipes)
      return false
    }
    setPageRecipes(null)
    applyImport(result.recipe, values.url)
    return true
  }

  function choosePageRecipe(recipe: ImportedRecipe) {
    setPageRecipes(null)
    applyImport(recipe, values.url)
  }

  function applyImport(recipe: ImportedRecipe, url: string) {
    // Livre et page lus sur la photo, sinon ceux déjà saisis (ou repris de la recette principale). Livre lu : l'écriture
    // de la source existante s'il y en a une.
    const imported = importedToFormValues(recipe, url)
    const next = { ...imported, source: (findSource(imported.source, sources) ?? imported.source) || values.source, page: imported.page || values.page }
    setValues(next)
    setSubmitted(false)
    setReview({ checks: importChecks(recipe, next), snapshot: next })
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

      if (linkTarget) {
        await linkToParent(recipeId, 'Recette enregistrée et liée', 'Recette enregistrée, mais pas liée')
        return
      }
      toast.success(wasSaved ? 'Recette enregistrée' : 'Recette sauvegardée')
      // Sur la fiche : proposer d'importer ou de lier les recettes auxquelles elle renvoie (« voir p. 208 »).
      if (from) navigate(from, { replace: true })
      else navigate(`/recettes/${recipeId}`, { replace: true, state: { offerLinks: true } })
    } catch (e) {
      if (e instanceof DuplicateRecipeUrlError) setDuplicate(e.existing)
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  /** Lie la sous-recette à l'ingrédient de la recette principale, puis y retourne (pour les autres renvois). */
  async function linkToParent(recipeId: string, done: string, failed: string) {
    if (!linkTarget) return
    const { parentId, reference } = linkTarget
    try {
      await api.recipes.linkIngredient(parentId, reference, recipeId)
      toast.success(`${done} à « ${parent?.title ?? 'la recette'} »`)
    } catch (e) {
      // La recette est enregistrée : le renvoi reste proposé sur la recette principale.
      toast.error(`${failed} : ${errorMessage(e)}`)
    }
    navigate(`/recettes/${parentId}`, { replace: true, state: { offerLinks: true } })
  }

  async function linkExisting(recipe: { id: string; title: string }) {
    setSaving(true)
    await linkToParent(recipe.id, `« ${recipe.title} » liée`, 'Lien impossible')
    setSaving(false)
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
  const backTo = from ?? (linkTarget ? `/recettes/${linkTarget.parentId}` : id && wasSaved ? `/recettes/${id}` : '/recettes')

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-3xl">
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Retour
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{title}</h1>
      {!wasSaved && (
        <p className="mb-6 text-sm text-muted-foreground">Complétez la recette pour la retrouver dans l'écran Recettes.</p>
      )}
      {linkTarget && (
        <p role="note" className="mt-3 flex items-start gap-2 rounded-xl border bg-background p-3 text-sm">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            Recette de « {linkTarget.reference.name} »{linkTarget.reference.page && ` (${linkTarget.reference.page})`}
            {parent && <> pour « {parent.title} »</>} : elle y sera liée à l’enregistrement.
          </span>
        </p>
      )}

      <div className="mt-6 space-y-8">
        {(!id || !wasSaved) && (
          <RecipeImportCard
            initialUrl={values.url}
            initialPhotos={sharedPhotos}
            hasContent={formHasContent(values)}
            onImport={importFromUrl}
            onImportPhotos={importFromPhotos}
          />
        )}

        {pageRecipes && (
          <section aria-labelledby="page-recipes-title" className="rounded-2xl border border-brand/25 bg-brand/5 p-4">
            <h2 id="page-recipes-title" className="text-sm font-semibold">
              Cette page contient {pageRecipes.length} recettes : laquelle préremplir ?
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Pour les autres, relis la même photo ensuite, ou utilise l’import en série.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pageRecipes.map((recipe, i) => (
                <Button key={i} type="button" variant="outline" className="h-10 px-3" onClick={() => choosePageRecipe(recipe)}>
                  {recipe.title}
                </Button>
              ))}
            </div>
          </section>
        )}

        {review && <ImportReview messages={fieldChecks(null)} pages={readPages} onDismiss={() => setReview(null)} />}

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
            {sameTitle && (
              <p role="status" className="flex items-start gap-1.5 text-sm">
                <CopyCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  Une recette « {sameTitle.title} » existe déjà.{' '}
                  <Link to={`/recettes/${sameTitle.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                    La voir
                  </Link>
                </span>
              </p>
            )}
            {sameTitle && linkTarget && (
              <Button type="button" variant="outline" className="h-10 px-3" disabled={saving} onClick={() => void linkExisting(sameTitle)}>
                <Link2 /> Lier à « {sameTitle.title} » sans créer de recette
              </Button>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
            <Field id="recipe-servings" label="Portions" error={shown.servings} checks={fieldChecks('servings')}>
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
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <Field id="recipe-source" label="Livre ou source" error={shown.source} hint="Ex. Pâtisserie maison">
              <SourceInput
                id="recipe-source"
                value={values.source}
                sources={sources}
                onChange={(source) => set('source', source)}
                invalid={Boolean(shown.source)}
              />
            </Field>
            <Field id="recipe-page" label="Page" error={shown.page}>
              <Input
                id="recipe-page"
                inputMode="numeric"
                value={values.page}
                maxLength={20}
                placeholder="146"
                onChange={(e) => set('page', e.target.value)}
                aria-invalid={Boolean(shown.page) || undefined}
                className="h-10 placeholder:text-muted-foreground/40"
              />
            </Field>
          </div>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-2 text-sm font-medium">Temps</legend>
            {DURATION_FIELDS.map(({ field, label, example }) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`recipe-${field}`} className="text-xs font-normal text-muted-foreground">
                  {label}
                </Label>
                <Input
                  id={`recipe-${field}`}
                  placeholder={example}
                  value={values[field]}
                  onChange={(e) => set(field, e.target.value)}
                  aria-invalid={Boolean(shown[field]) || undefined}
                  className="h-10 placeholder:text-muted-foreground/40"
                />
              </div>
            ))}
            {DURATION_FIELDS.some(({ field }) => shown[field]) && (
              <p className="col-span-3 text-sm text-destructive">{DURATION_FIELDS.map(({ field }) => shown[field]).find(Boolean)}</p>
            )}
          </fieldset>
          <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">Valeurs nutritionnelles</legend>
            <div className="space-y-1">
              <Label htmlFor="recipe-kcal" className="text-xs font-normal text-muted-foreground">
                Calories (kcal)
              </Label>
              <Input
                id="recipe-kcal"
                inputMode="numeric"
                placeholder="450"
                value={values.kcal}
                onChange={(e) => set('kcal', e.target.value)}
                aria-invalid={Boolean(shown.nutrition) || undefined}
                className="h-10 placeholder:text-muted-foreground/40"
              />
            </div>
            {MACRO_FIELDS.map(({ field, label }) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`recipe-${field}`} className="text-xs font-normal text-muted-foreground">
                  {label} (g)
                </Label>
                <Input
                  id={`recipe-${field}`}
                  inputMode="decimal"
                  value={values[field]}
                  onChange={(e) => set(field, e.target.value)}
                  aria-invalid={Boolean(shown.nutrition) || undefined}
                  className="h-10"
                />
              </div>
            ))}
            <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
              <Label htmlFor="recipe-nutrition-per" className="text-xs font-normal text-muted-foreground">
                Valeurs
              </Label>
              <select
                id="recipe-nutrition-per"
                value={values.nutritionPer}
                onChange={(e) => set('nutritionPer', e.target.value as NutritionBasis)}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {NUTRITION_BASES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            {shown.nutrition && <p className="col-span-2 text-sm text-destructive sm:col-span-4">{shown.nutrition}</p>}
          </fieldset>
          <Field id="recipe-tags" label="Tags" hint="Ex. végé, rapide, dessert">
            <TagInput id="recipe-tags" value={values.tags} suggestions={tagSuggestions} onChange={(tags) => set('tags', tags)} />
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs" aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading" className="font-semibold tracking-tight">Ingrédients</h2>
          <IngredientsEditor rows={values.ingredients} errors={shown.ingredientRows} flags={flags} onChange={(rows) => set('ingredients', rows)} />
          {shown.ingredients && <p className="text-sm text-destructive">{shown.ingredients}</p>}
        </section>

        <section className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs">
          <Field id="recipe-notes" label="Étapes" checks={fieldChecks('notes')}>
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

import { ArrowLeft, CheckCircle2, CircleAlert, CircleDashed, CopyCheck, FolderOpen, Images, Loader2, MinusCircle, Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SourceInput } from '@/components/recipes/SourceInput'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/Layout'
import { useApi } from '@/app/ApiContext'
import {
  BATCH_CONCURRENCY,
  fileLabel,
  imageFiles,
  importOne,
  mergeRetry,
  needsRetry,
  runQueue,
  tally,
  type BatchItem,
  type BatchStatus,
  type RecipeOutcome,
} from '@/lib/batchImport'
import { findSource, recipeKey } from '@/lib/sources'
import { cn } from '@/lib/utils'

type Phase = 'setup' | 'running' | 'paused' | 'done'

type StatusStyle = { label: string; icon: typeof CheckCircle2; className: string }

/** État de l'image (avant lecture, ou sans recette lisible). */
const IMAGE_STATUS: Record<Exclude<BatchStatus, 'done'>, StatusStyle> = {
  pending: { label: 'En attente', icon: CircleDashed, className: 'text-muted-foreground' },
  reading: { label: 'Lecture…', icon: Loader2, className: 'animate-spin text-brand' },
  skipped: { label: 'Ignorée', icon: MinusCircle, className: 'text-muted-foreground' },
  error: { label: 'Erreur', icon: CircleAlert, className: 'text-destructive' },
}

/** Résultat de chaque recette lue sur l'image. */
const RECIPE_STATUS: Record<RecipeOutcome, StatusStyle> = {
  saved: { label: 'Enregistrée', icon: CheckCircle2, className: 'text-brand' },
  duplicate: { label: 'Déjà enregistrée', icon: CopyCheck, className: 'text-muted-foreground' },
  incomplete: { label: 'À compléter à la main', icon: TriangleAlert, className: 'text-amber-700 dark:text-amber-400' },
  error: { label: 'Erreur', icon: CircleAlert, className: 'text-destructive' },
}

const SUMMARY: [keyof ReturnType<typeof tally>, (n: number) => string][] = [
  ['saved', (n) => `${n} enregistrée${n > 1 ? 's' : ''}`],
  ['duplicate', (n) => `${n} déjà enregistrée${n > 1 ? 's' : ''}`],
  ['skipped', (n) => `${n} ignorée${n > 1 ? 's' : ''}`],
  ['incomplete', (n) => `${n} à compléter`],
  ['error', (n) => `${n} en erreur`],
]

/** Une ligne de résultat : icône, titre éventuel, état et précision. */
function StatusLine({ style, message, error, children }: { style: StatusStyle; message?: string; error: boolean; children?: React.ReactNode }) {
  const Icon = style.icon
  return (
    <li className="flex items-start gap-2">
      <Icon className={cn('mt-0.5 size-4 shrink-0', style.className)} aria-hidden />
      <div className="min-w-0 flex-1">
        {children}
        <p className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {style.label}
          {message && message !== style.label && ` · ${message}`}
        </p>
      </div>
    </li>
  )
}

/** Choisir un dossier n'a de sens que sur ordinateur (et seuls certains navigateurs le permettent). */
function canPickFolder(): boolean {
  return 'webkitdirectory' in document.createElement('input') && window.matchMedia?.('(pointer: fine)').matches === true
}

/** Import en série : une image = une page = une recette, lues et enregistrées automatiquement, 2 à la fois. */
export function RecipeBatchImportPage() {
  const api = useApi()
  const [book, setBook] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [items, setItems] = useState<BatchItem[]>([])
  const [phase, setPhase] = useState<Phase>('setup')
  const [submitted, setSubmitted] = useState(false)
  const paused = useRef(false)
  const known = useRef(new Map<string, string>())
  const tags = useRef<string[]>([])
  const folderInput = useRef<HTMLInputElement>(null)
  const photosInput = useRef<HTMLInputElement>(null)
  const [folderPicker] = useState(canPickFolder)

  useEffect(() => {
    api.recipes.listSources().then(setSources, () => setSources([]))
  }, [api])

  // Quitter la page arrête l'import : on prévient tant qu'il tourne.
  const running = phase === 'running'
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])
  // Page quittée dans l'application : plus aucune image n'est lancée.
  useEffect(() => () => void (paused.current = true), [])

  function choose(input: HTMLInputElement) {
    const files = [...(input.files ?? [])]
    // Vidé : rouvrir le sélecteur relit la galerie, et choisir les mêmes images remet la liste à jour.
    input.value = ''
    if (files.length === 0) return
    setItems(imageFiles(files).map((file, i) => ({ key: `${i}-${fileLabel(file)}`, file, status: 'pending', recipes: [] })))
  }

  const update = (key: string, patch: Partial<BatchItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  async function run(queue: BatchItem[]) {
    paused.current = false
    setPhase('running')
    await runQueue(
      queue,
      async (item) => {
        update(item.key, { status: 'reading', message: undefined })
        const result = await importOne(item.file, { api, book: findSource(book, sources) ?? book.trim(), tags: tags.current, known: known.current })
        // Image relue après une erreur : ce qui avait abouti reste tel quel.
        update(item.key, { message: undefined, ...mergeRetry(item.recipes, result) })
      },
      { concurrency: BATCH_CONCURRENCY, isPaused: () => paused.current },
    )
    setPhase(paused.current ? 'paused' : 'done')
  }

  async function start() {
    setSubmitted(true)
    if (!book.trim() || items.length === 0) return
    setPhase('running')
    // Recettes déjà enregistrées (même titre et même livre : doublons sautés) et tags existants (réutilisés par le modèle).
    const [saved, existingTags] = await Promise.all([
      api.recipes.listSavedSummaries().catch(() => []),
      api.recipes.listTags().catch(() => [] as string[]),
    ])
    known.current = new Map(saved.map((r) => [recipeKey(r.title, r.source), r.id]))
    tags.current = existingTags
    await run(items)
  }

  const pendingItems = () => items.filter((i) => i.status === 'pending')
  function retryErrors() {
    const retried = items.filter(needsRetry).map((i) => ({ ...i, status: 'pending' as const, message: undefined }))
    setItems((list) => list.map((i) => retried.find((r) => r.key === i.key) ?? i))
    void run(retried)
  }

  const finished = items.filter((i) => i.status !== 'pending' && i.status !== 'reading').length
  const counts = tally(items)
  const toRetry = items.filter(needsRetry).length
  const bookError = submitted && !book.trim() ? 'Indique le livre' : null

  return (
    <>
      <Link to="/recettes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Recettes
      </Link>
      <PageHeader title="Importer en série" description="Une image par page : chaque recette est lue et enregistrée automatiquement." />

      {phase === 'setup' ? (
        <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-background p-5 shadow-xs">
          <div className="space-y-2">
            <Label htmlFor="batch-book">Livre</Label>
            <SourceInput
              id="batch-book"
              value={book}
              sources={sources}
              placeholder="Pâtisserie maison"
              onChange={setBook}
              invalid={Boolean(bookError)}
              className="placeholder:text-muted-foreground/40"
            />
            {bookError ? (
              <p className="text-sm text-destructive">{bookError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">La page de chaque recette est lue sur l’image quand elle est imprimée.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Images</p>
            <div className="flex flex-wrap gap-2">
              {folderPicker && (
                <Button type="button" variant="outline" className="h-10 px-3" onClick={() => folderInput.current?.click()}>
                  <FolderOpen /> Choisir un dossier
                </Button>
              )}
              <Button type="button" variant="outline" className="h-10 px-3" onClick={() => photosInput.current?.click()}>
                <Images /> Choisir des photos
              </Button>
            </div>
            <input
              ref={folderInput}
              type="file"
              className="hidden"
              aria-label="Dossier d’images"
              // Attribut non standard (Chrome, Edge, Firefox) : tout le contenu du dossier.
              {...{ webkitdirectory: '' }}
              onChange={(e) => choose(e.target)}
            />
            <input
              ref={photosInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="Photos des pages"
              onChange={(e) => choose(e.target)}
            />
            {items.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {items.length} image{items.length > 1 ? 's' : ''} · de « {fileLabel(items[0]!.file)} » à « {fileLabel(items.at(-1)!.file)} »
              </p>
            ) : (
              submitted && <p className="text-sm text-destructive">Choisis au moins une image</p>
            )}
          </div>

          <Button className="h-10 px-4" onClick={() => void start()}>
            <Play /> Lancer l’import{items.length > 0 && ` (${items.length})`}
          </Button>
        </section>
      ) : (
        <section className="mx-auto max-w-2xl space-y-4" aria-labelledby="batch-progress">
          <div className="space-y-3 rounded-2xl border bg-background p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="batch-progress" className="font-semibold tracking-tight">
                {phase === 'done' ? 'Import terminé' : phase === 'paused' ? 'En pause' : 'Import en cours'} · {finished} / {items.length}
              </h2>
              {phase === 'running' && (
                <Button variant="outline" className="h-10 px-3" onClick={() => void (paused.current = true)}>
                  <Pause /> Pause
                </Button>
              )}
              {phase === 'paused' && (
                <Button className="h-10 px-3" onClick={() => void run(pendingItems())}>
                  <Play /> Reprendre
                </Button>
              )}
            </div>
            <div
              role="progressbar"
              aria-label="Avancement de l’import"
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={finished}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${items.length ? (finished / items.length) * 100 : 0}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {SUMMARY.filter(([status]) => counts[status] > 0)
                .map(([status, text]) => text(counts[status]))
                .join(' · ') || 'Lecture des premières images…'}
            </p>
            {phase === 'running' && <p className="text-xs text-muted-foreground">Garde cette page ouverte jusqu’à la fin.</p>}
            {phase === 'done' && (
              <div className="flex flex-wrap gap-2">
                {toRetry > 0 && (
                  <Button variant="outline" className="h-10 px-3" onClick={retryErrors}>
                    <RotateCcw /> Réessayer les erreurs ({toRetry})
                  </Button>
                )}
                <Link to="/recettes" className={cn(buttonVariants(), 'h-10 px-4')}>
                  Voir les recettes
                </Link>
              </div>
            )}
          </div>

          <ul className="divide-y rounded-2xl border bg-background shadow-xs" aria-label="Images importées">
            {items.map((item) => (
              <li key={item.key} className="space-y-2 px-4 py-3 text-sm" data-testid="batch-item">
                <p className="truncate text-xs text-muted-foreground">
                  {fileLabel(item.file)}
                  {item.recipes.length > 1 && ` · ${item.recipes.length} recettes`}
                </p>
                {item.status === 'done' ? (
                  <ul className="space-y-1.5">
                    {item.recipes.map((recipe, i) => (
                      <StatusLine key={i} style={RECIPE_STATUS[recipe.status]} message={recipe.message} error={recipe.status === 'error'}>
                        {recipe.recipeId ? (
                          <Link to={`/recettes/${recipe.recipeId}`} className="font-medium underline-offset-4 hover:underline">
                            {recipe.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{recipe.title}</span>
                        )}
                      </StatusLine>
                    ))}
                  </ul>
                ) : (
                  <ul>
                    <StatusLine style={IMAGE_STATUS[item.status]} message={item.message} error={item.status === 'error'} />
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

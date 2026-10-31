import { Camera, CheckCircle2, ClipboardPaste, Link2, Loader2, Plus, ScanText, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DuplicateRecipeUrlError, errorMessage } from '@/api'
import { isValidUrl } from '@/lib/meals'
import { isInstagramUrl, isYoutubeUrl, siteName } from '@/lib/recipes'

/** Pages lues au plus (une recette sur une double page). */
export const MAX_RECIPE_PHOTOS = 2

interface Props {
  /** Lien déjà connu (ex. recette ponctuelle du planning). */
  initialUrl: string
  /** Photos partagées depuis la galerie du téléphone : lues tout de suite. */
  initialPhotos?: File[]
  /** Le formulaire contient une saisie que l'import remplacerait. */
  hasContent: boolean
  /** Lance l'import ; rejette avec une erreur affichable. Vidéo : renvoie la page où la recette a été trouvée. */
  onImport: (url: string) => Promise<string | void>
  /** Analyse un texte collé (légende Instagram) avec le lien de la publication. */
  onImportText: (text: string, url: string) => Promise<void>
  /** Lit la recette sur les photos ; rejette avec une erreur affichable. `false` : rien de prérempli pour l'instant (choix à faire). */
  onImportPhotos: (photos: File[]) => Promise<boolean | void>
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; source: 'link' | 'photos' | 'caption' }
  | { kind: 'done'; source: string }
  | { kind: 'error'; message: string }

interface Page {
  key: number
  file: File
  preview: string
}

/** Préremplissage du formulaire à partir de l'adresse d'une recette en ligne, ou de photos d'un livre. */
/** Texte collé : en dessous, ce n'est pas une recette. */
const MIN_CAPTION = 20

export function RecipeImportCard({ initialUrl, initialPhotos, hasContent, onImport, onImportText, onImportPhotos }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [caption, setCaption] = useState('')
  const captionInput = useRef<HTMLTextAreaElement>(null)
  const instagram = isInstagramUrl(url)
  const [pages, setPages] = useState<Page[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [confirming, setConfirming] = useState<'link' | 'photos' | 'caption' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pageSeq = useRef(0)
  const loading = state.kind === 'loading'

  // Libère les aperçus des pages.
  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  })
  useEffect(() => () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  function toPages(files: File[]): Page[] {
    return files.map((file) => ({ key: ++pageSeq.current, file, preview: URL.createObjectURL(file) }))
  }

  /** Ajoute des pages (2 au plus) et renvoie la liste obtenue. */
  function addPages(files: File[], current: Page[]): Page[] {
    const images = files.filter((f) => f.type.startsWith('image/'))
    const room = MAX_RECIPE_PHOTOS - current.length
    setNotice(images.length > room ? `${MAX_RECIPE_PHOTOS} pages au plus : seules les premières sont gardées.` : null)
    const next = [...current, ...toPages(images.slice(0, Math.max(room, 0)))]
    setPages(next)
    return next
  }

  async function runLink() {
    const target = url.trim()
    setState({ kind: 'loading', source: 'link' })
    try {
      const found = await onImport(target)
      setState({ kind: 'done', source: found ? `${siteName(found)} (recette de la vidéo trouvée en ligne)` : siteName(target) })
    } catch (error) {
      // Recette déjà enregistrée : le formulaire affiche l'avertissement et les actions possibles.
      setState(error instanceof DuplicateRecipeUrlError ? { kind: 'idle' } : { kind: 'error', message: errorMessage(error) })
    }
  }

  async function runCaption() {
    setState({ kind: 'loading', source: 'caption' })
    try {
      await onImportText(caption.trim(), url.trim())
      setState({ kind: 'done', source: 'la légende' })
    } catch (error) {
      setState({ kind: 'error', message: errorMessage(error) })
    }
  }

  function submitCaption() {
    if (caption.trim().length < MIN_CAPTION) {
      setState({ kind: 'error', message: 'Colle la légende du reel ci-dessous.' })
      captionInput.current?.focus()
      return
    }
    if (hasContent) setConfirming('caption')
    else void runCaption()
  }

  async function runPhotos(list: Page[] = pages) {
    if (list.length === 0) return
    setState({ kind: 'loading', source: 'photos' })
    try {
      const prefilled = await onImportPhotos(list.map((p) => p.file))
      setState(prefilled === false ? { kind: 'idle' } : { kind: 'done', source: list.length > 1 ? 'tes photos' : 'ta photo' })
    } catch (error) {
      setState({ kind: 'error', message: errorMessage(error) })
    }
  }

  // Photos partagées depuis la galerie : lues dès l'ouverture (le formulaire est vide).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !initialPhotos || initialPhotos.length === 0) return
    started.current = true
    void runPhotos(addPages(initialPhotos, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, à l'arrivée des photos partagées
  }, [initialPhotos])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!isValidUrl(url.trim())) {
      setState({ kind: 'error', message: 'Colle un lien complet (https://…).' })
      return
    }
    // Instagram ne laisse pas lire ses publications : c'est la légende collée qui est analysée.
    if (instagram) return submitCaption()
    if (hasContent) setConfirming('link')
    else void runLink()
  }

  function readPhotos() {
    if (hasContent) setConfirming('photos')
    else void runPhotos()
  }

  function removePage(key: number) {
    setPages((list) => {
      const page = list.find((p) => p.key === key)
      if (page) URL.revokeObjectURL(page.preview)
      return list.filter((p) => p.key !== key)
    })
    setNotice(null)
  }

  return (
    <section aria-labelledby="import-heading" className="rounded-2xl border border-brand/25 bg-brand/5 p-5">
      <h2 id="import-heading" className="flex items-center gap-2 font-semibold tracking-tight">
        <Sparkles className="size-4 text-brand" aria-hidden />
        Préremplir la recette
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Depuis un lien ou la photo d'un livre : titre, ingrédients et étapes sont remplis pour toi.
      </p>

      {/* Pas de <form> imbriqué : Entrée lance l’import sans enregistrer la recette. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="url"
            inputMode="url"
            aria-label="Lien de la recette à importer"
            placeholder="https://www.marmiton.org/recettes/…"
            value={url}
            disabled={loading}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit(e)
            }}
            className="h-10 bg-background pl-9"
          />
        </div>
        <Button type="button" className="h-10 px-4" disabled={loading || url.trim() === ''} onClick={handleSubmit}>
          {state.kind === 'loading' && state.source === 'link' ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {state.kind === 'loading' && state.source === 'link' ? 'Analyse…' : 'Préremplir'}
        </Button>
      </div>

      {instagram && (
        <div className="mt-3 space-y-2 rounded-xl border bg-background p-3">
          <label htmlFor="import-caption" className="text-sm font-medium">
            Légende du reel
          </label>
          <p className="text-xs text-muted-foreground">
            Instagram ne laisse pas lire ses publications. Dans Instagram, reste appuyé sur la légende, choisis « Copier », puis colle-la ici.
          </p>
          <Textarea
            ref={captionInput}
            id="import-caption"
            rows={5}
            value={caption}
            disabled={loading}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Ingrédients : 200 g de…"
          />
          <Button type="button" className="h-10 px-4" disabled={loading || caption.trim() === ''} onClick={submitCaption}>
            {state.kind === 'loading' && state.source === 'caption' ? <Loader2 className="animate-spin" aria-hidden /> : <ClipboardPaste aria-hidden />}
            {state.kind === 'loading' && state.source === 'caption' ? 'Analyse…' : 'Préremplir avec la légende'}
          </Button>
        </div>
      )}

      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            addPages([...(e.target.files ?? [])], pages)
            e.target.value = ''
          }}
        />
        {pages.length === 0 ? (
          <Button type="button" variant="outline" className="h-10 w-full bg-background sm:w-auto" disabled={loading} onClick={() => fileInput.current?.click()}>
            <Camera aria-hidden /> Photo d'un livre ou scan
          </Button>
        ) : (
          <>
            <ul className="flex flex-wrap gap-2" aria-label="Pages à lire">
              {pages.map((page, index) => (
                <li key={page.key} className="relative">
                  <img src={page.preview} alt={`Page ${index + 1}`} className="h-24 w-20 rounded-lg border bg-background object-cover" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="absolute -top-2 -right-2 rounded-full shadow-sm"
                    aria-label={`Retirer la page ${index + 1}`}
                    disabled={loading}
                    onClick={() => removePage(page.key)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
              {pages.length < MAX_RECIPE_PHOTOS && (
                <li>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => fileInput.current?.click()}
                    className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-background text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  >
                    <Plus className="size-4" aria-hidden />
                    Ajouter une page
                  </button>
                </li>
              )}
            </ul>
            <Button type="button" className="h-10 px-4" disabled={loading} onClick={readPhotos}>
              {state.kind === 'loading' && state.source === 'photos' ? <Loader2 className="animate-spin" aria-hidden /> : <ScanText aria-hidden />}
              {state.kind === 'loading' && state.source === 'photos' ? 'Lecture…' : 'Lire la recette'}
            </Button>
          </>
        )}
        {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      </div>

      <div aria-live="polite" className="text-sm">
        {state.kind === 'loading' && (
          <p className="mt-3 text-muted-foreground">
            {state.source === 'photos'
              ? 'Lecture de la recette sur la photo, quelques secondes…'
              : state.source === 'caption'
                ? 'Analyse de la légende, quelques secondes…'
                : isYoutubeUrl(url)
                  ? 'Lecture de la vidéo : sa description, et si besoin la recette cherchée en ligne (jusqu’à une minute)…'
                  : 'Lecture de la page et analyse de la recette, quelques secondes…'}
          </p>
        )}
        {state.kind === 'done' && (
          <p role="status" className="mt-3 flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              Recette préremplie depuis <span className="font-medium">{state.source}</span>. Vérifie les quantités avant d'enregistrer.
            </span>
          </p>
        )}
      </div>
      {state.kind === 'error' && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Remplacer le contenu du formulaire ?"
        description={`Le titre, les portions, les ingrédients, la préparation et les tags seront remplacés par ceux ${confirming === 'photos' ? 'de la photo' : confirming === 'caption' ? 'de la légende' : 'de la page'}.`}
        confirmLabel="Remplacer"
        onConfirm={() => (confirming === 'photos' ? runPhotos() : confirming === 'caption' ? runCaption() : runLink())}
      />
    </section>
  )
}

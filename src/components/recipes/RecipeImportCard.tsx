import { CheckCircle2, Link2, Loader2, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { errorMessage } from '@/api'
import { isValidUrl } from '@/lib/meals'
import { siteName } from '@/lib/recipes'

interface Props {
  /** Lien déjà connu (ex. recette ponctuelle du planning). */
  initialUrl: string
  /** Le formulaire contient une saisie que l'import remplacerait. */
  hasContent: boolean
  /** Lance l'import ; rejette avec une erreur affichable. */
  onImport: (url: string) => Promise<void>
}

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; site: string } | { kind: 'error'; message: string }

/** Préremplissage du formulaire à partir de l'adresse d'une recette en ligne. */
export function RecipeImportCard({ initialUrl, hasContent, onImport }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const loading = state.kind === 'loading'

  async function run() {
    const target = url.trim()
    setState({ kind: 'loading' })
    try {
      await onImport(target)
      setState({ kind: 'done', site: siteName(target) })
    } catch (error) {
      setState({ kind: 'error', message: errorMessage(error) })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!isValidUrl(url.trim())) {
      setState({ kind: 'error', message: 'Colle un lien complet (https://…).' })
      return
    }
    if (hasContent) setConfirming(true)
    else void run()
  }

  return (
    <section aria-labelledby="import-heading" className="rounded-2xl border border-brand/25 bg-brand/5 p-5">
      <h2 id="import-heading" className="flex items-center gap-2 font-semibold tracking-tight">
        <Sparkles className="size-4 text-brand" aria-hidden />
        Préremplir depuis un lien
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Colle l'adresse d'une recette : titre, ingrédients, étapes et photo sont remplis pour toi.</p>

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
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {loading ? 'Analyse…' : 'Préremplir'}
        </Button>
      </div>

      <div aria-live="polite" className="text-sm">
        {state.kind === 'loading' && <p className="mt-3 text-muted-foreground">Lecture de la page et analyse de la recette, quelques secondes…</p>}
        {state.kind === 'done' && (
          <p role="status" className="mt-3 flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              Recette préremplie depuis <span className="font-medium">{state.site}</span>. Vérifie les quantités avant d'enregistrer.
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
        open={confirming}
        onOpenChange={setConfirming}
        title="Remplacer le contenu du formulaire ?"
        description="Le titre, les portions, les ingrédients, la préparation et les tags seront remplacés par ceux de la page."
        confirmLabel="Remplacer"
        onConfirm={run}
      />
    </section>
  )
}

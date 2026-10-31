import { Check, CheckCheck, Loader2, Minus, Plus, RefreshCw, SearchX, Sun, Timer as TimerIcon, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { NewTimerForm, StepText, TimersBar } from '@/components/cooking/CookingTimers'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useTimers } from '@/hooks/useTimers'
import { useWakeLock } from '@/hooks/useWakeLock'
import { NO_PROGRESS, splitSteps, toggle, type CookingProgress } from '@/lib/cooking'
import { formatTimerDuration } from '@/lib/timers'
import { formatIngredient, groupBySection, scaleIngredients, SERVINGS_MAX, type Recipe } from '@/lib/recipes'
import { cn } from '@/lib/utils'

/** Mode cuisine : écran allumé, ingrédients et étapes à cocher, en gros ; progression enregistrée (plusieurs jours) ; minuteurs. */
export function CookingPage() {
  const { id = '' } = useParams()
  return <Cooking key={id} id={id} />
}

function Cooking({ id }: { id: string }) {
  const api = useApi()
  const [params, setParams] = useSearchParams()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [progress, setProgress] = useState<CookingProgress>(NO_PROGRESS)
  const [finishing, setFinishing] = useState(false)
  const awake = useWakeLock()
  const timers = useTimers(id)
  const [newTimer, setNewTimer] = useState(false)

  // La progression est chargée avec la recette : sans elle, la première case cochée écraserait celle enregistrée.
  const load = useCallback(() => {
    setError(null)
    Promise.all([api.recipes.getRecipe(id), api.recipes.getProgress(id)]).then(
      ([loaded, saved]) => {
        if (saved) {
          setProgress({ ingredients: saved.ingredients, steps: saved.steps })
          // Reprise sans nombre de personnes dans l'adresse : celui de la séance précédente.
          if (saved.people) setParams((p) => (p.has('personnes') ? p : new URLSearchParams({ personnes: String(saved.people) })), { replace: true })
        }
        setRecipe(loaded)
      },
      (e: unknown) => setError(errorMessage(e)),
    )
  }, [api, id, setParams])

  useEffect(load, [load])

  // Enregistrement en base, un à la fois : seule la dernière progression compte (cases cochées vite à la suite).
  const saving = useRef<{ next: CookingProgress | null; running: Promise<void> | null; failed: boolean }>({ next: null, running: null, failed: false })
  const persist = useCallback(
    (next: CookingProgress) => {
      const queue = saving.current
      queue.next = next
      if (queue.running) return
      queue.running = (async () => {
        while (queue.next) {
          const current = queue.next
          queue.next = null
          try {
            await api.recipes.saveProgress(id, current)
            queue.failed = false
          } catch (e) {
            // Un seul message tant que l'enregistrement échoue ; les cases restent cochées à l'écran.
            if (!queue.failed) toast.error(`Progression non enregistrée : ${errorMessage(e)}`)
            queue.failed = true
          }
        }
        queue.running = null
      })()
    },
    [api, id],
  )

  // Cases cochées enregistrées avec le nombre de personnes affiché (`servings`, calculé une fois la recette chargée).
  function update(next: CookingProgress) {
    setProgress(next)
    persist({ ...next, people: servings })
  }

  /** Recette terminée : la progression est effacée, retour à la fiche. */
  async function finish() {
    setFinishing(true)
    // Enregistrement en cours terminé d'abord : il ne doit pas recréer la progression après l'effacement.
    saving.current.next = null
    await saving.current.running
    try {
      await api.recipes.saveProgress(id, NO_PROGRESS)
      timers.clear()
      toast.success('Recette terminée')
      navigate(`/recettes/${id}`, { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setFinishing(false)
    }
  }

  const back = `/recettes/${id}`

  if (error) {
    return (
      <div className="p-4">
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{error}</p>
          <Button variant="outline" onClick={load}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      </div>
    )
  }

  if (recipe === undefined) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="Chargement de la recette">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (recipe === null || !recipe.is_saved) {
    return (
      <div className="p-4">
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
      </div>
    )
  }

  // Nombre de personnes choisi sur la fiche (adresse), sinon celui de la recette.
  const asked = Number(params.get('personnes'))
  const servings = recipe.servings === null ? null : Number.isInteger(asked) && asked >= 1 && asked <= SERVINGS_MAX ? asked : recipe.servings
  const setServings = (value: number) => {
    const next = Math.min(SERVINGS_MAX, Math.max(1, value))
    setParams({ personnes: String(next) }, { replace: true })
    if (started) persist({ ...progress, people: next })
  }
  const ingredients = (recipe.servings !== null && servings !== null ? scaleIngredients(recipe.ingredients, recipe.servings, servings) : recipe.ingredients).map(
    (ingredient, position) => ({ ...ingredient, position }),
  )
  const steps = splitSteps(recipe.notes)
  const current = steps.findIndex((_, i) => !progress.steps.includes(i))
  const finished = steps.length > 0 && current === -1
  const started = progress.ingredients.length > 0 || progress.steps.length > 0

  return (
    <div className="min-h-dvh bg-page pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <Link to={back} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'shrink-0')} aria-label="Quitter le mode cuisine">
            <X />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{recipe.title}</h1>
          <Button variant="ghost" className="h-10 shrink-0 px-2" onClick={() => setNewTimer((open) => !open)} aria-expanded={newTimer} aria-label="Nouveau minuteur">
            <TimerIcon /> <span className="max-sm:hidden">Minuteur</span>
          </Button>
          {started && (
            <Button variant="ghost" className="h-10 shrink-0 px-2" onClick={() => void finish()} disabled={finishing} aria-label="Terminer la recette">
              {finishing ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck />} <span className="max-sm:hidden">Terminer</span>
            </Button>
          )}
        </div>
      </header>

      {/* Place pour la barre des minuteurs (une carte par ligne sur téléphone, 45 % de l'écran au plus). */}
      <main
        className="mx-auto max-w-3xl space-y-8 px-4 pt-5 pb-10"
        style={timers.timers.length > 0 ? { paddingBottom: `min(45dvh, ${timers.timers.length * 4.5 + 1.5}rem)` } : undefined}
      >
        {newTimer && (
          <NewTimerForm
            onStart={(minutes) => {
              const seconds = Math.round(minutes * 60)
              timers.start(`libre-${Date.now()}`, `Minuteur ${formatTimerDuration(seconds)}`, seconds)
            }}
            onClose={() => setNewTimer(false)}
          />
        )}
        {awake && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sun className="size-4" aria-hidden /> L’écran reste allumé.
          </p>
        )}

        <section aria-labelledby="cooking-ingredients">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="cooking-ingredients" className="text-xl font-semibold tracking-tight">
              Ingrédients
            </h2>
            {servings !== null && (
              <div className="flex items-center gap-1" role="group" aria-label="Nombre de personnes">
                <Button variant="outline" size="icon-lg" aria-label="Une personne de moins" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
                  <Minus />
                </Button>
                <span className="min-w-24 text-center tabular-nums" aria-live="polite">
                  {servings} {servings > 1 ? 'personnes' : 'personne'}
                </span>
                <Button variant="outline" size="icon-lg" aria-label="Une personne de plus" disabled={servings >= SERVINGS_MAX} onClick={() => setServings(servings + 1)}>
                  <Plus />
                </Button>
              </div>
            )}
          </div>
          {groupBySection(ingredients).map((group, g) => (
            <div key={g} className={cn(g > 0 && 'mt-4')}>
              {group.section && <h3 className="mb-1 text-sm font-medium tracking-wide text-muted-foreground uppercase">{group.section}</h3>}
              <ul className="space-y-1">
                {group.items.map((ingredient) => {
                  const done = progress.ingredients.includes(ingredient.position)
                  return (
                    <li key={ingredient.position}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        onClick={() => update({ ...progress, ingredients: toggle(progress.ingredients, ingredient.position) })}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left text-lg hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <CheckMark done={done} />
                        <span className={cn(done && 'text-muted-foreground line-through')}>{formatIngredient(ingredient)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="cooking-steps">
          <h2 id="cooking-steps" className="mb-3 text-xl font-semibold tracking-tight">
            Étapes
          </h2>
          {steps.length === 0 ? (
            <p className="text-muted-foreground">Aucune étape renseignée.</p>
          ) : (
            <ol className="space-y-3">
              {steps.map((step, i) => {
                const done = progress.steps.includes(i)
                const isCurrent = i === current
                return (
                  <li key={i}>
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-2xl border bg-background p-4 shadow-xs transition-colors',
                        isCurrent && 'border-brand ring-2 ring-brand/30',
                        done && 'bg-muted/50 shadow-none',
                      )}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        aria-label={`Étape ${i + 1} faite`}
                        onClick={() => update({ ...progress, steps: toggle(progress.steps, i) })}
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-lg font-semibold tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          done ? 'border-brand bg-brand text-white' : isCurrent ? 'border-brand text-brand' : 'border-border text-muted-foreground',
                        )}
                      >
                        {done ? <Check className="size-5" aria-hidden /> : i + 1}
                      </button>
                      <StepText
                        text={step}
                        step={i}
                        timers={timers.timers}
                        now={timers.now}
                        onStart={timers.start}
                        className={cn('block pt-1.5 text-lg leading-relaxed', done && 'text-muted-foreground line-through')}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {finished && (
            <p className="mt-5 rounded-2xl bg-brand/10 p-4 text-center text-lg font-medium" role="status">
              Toutes les étapes sont faites. Bon appétit !
            </p>
          )}
        </section>

        <div className="space-y-2">
          {started && (
            <Button className="h-11 w-full px-4" onClick={() => void finish()} disabled={finishing}>
              {finishing ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck />} Terminer la recette
            </Button>
          )}
          <Link to={back} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full px-4')}>
            Quitter le mode cuisine
          </Link>
          {started && <p className="text-center text-sm text-muted-foreground">En quittant, ta progression est gardée : tu pourras reprendre plus tard.</p>}
        </div>
      </main>

      <TimersBar
        timers={timers.timers}
        now={timers.now}
        onPause={timers.pause}
        onResume={timers.resume}
        onAddMinute={timers.addMinute}
        onRemove={timers.remove}
      />
    </div>
  )
}

function CheckMark({ done }: { done: boolean }) {
  return (
    <span
      className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2', done ? 'border-brand bg-brand text-white' : 'border-border')}
      aria-hidden
    >
      {done && <Check className="size-4" />}
    </span>
  )
}

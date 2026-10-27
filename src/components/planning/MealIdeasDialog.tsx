import { BookOpen, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/app/ApiContext'
import { AppError, errorMessage } from '@/api'
import type { IsoDate } from '@/lib/dates'
import { buildIdeasInput, ideaKey, ideasPeriod, type MealIdea } from '@/lib/mealIdeas'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  today: IsoDate
  /** Après l'ajout à « À planifier » (pour recharger la liste). */
  onAdded: () => void
}

type State = { kind: 'loading' } | { kind: 'ready'; ideas: MealIdea[] } | { kind: 'error'; message: string }

/** Idées de repas pour les prochains jours : on coche celles qui plaisent, elles vont dans « À planifier ». */
export function MealIdeasDialog({ open, onOpenChange, today, onAdded }: Props) {
  const api = useApi()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  // Une recherche relancée ou une fenêtre fermée rend la précédente obsolète.
  const requestId = useRef(0)

  const search = useCallback(async () => {
    const id = ++requestId.current
    setState({ kind: 'loading' })
    setSelected(new Set())
    try {
      const { from, to } = ideasPeriod(today)
      const [recipes, meals] = await Promise.all([api.recipes.listSavedRecipes(), api.meals.listMeals(from, to)])
      const ideas = await api.ideas.suggestMeals(buildIdeasInput(today, recipes, meals))
      if (id === requestId.current) setState({ kind: 'ready', ideas })
    } catch (error) {
      if (id === requestId.current) setState({ kind: 'error', message: errorMessage(error) })
    }
  }, [api, today])

  useEffect(() => {
    if (open) void search()
    else requestId.current += 1
  }, [open, search])

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function add() {
    if (state.kind !== 'ready') return
    setAdding(true)
    let added = 0
    let failure: string | null = null
    for (const idea of state.ideas.filter((i) => selected.has(ideaKey(i)))) {
      try {
        await api.inbox.addItem(idea.source === 'saved' ? { recipeId: idea.recipeId } : { title: idea.title, url: idea.url })
        added += 1
      } catch (error) {
        // Déjà dans « À planifier » : rien à faire.
        if (error instanceof AppError && error.code === '23505') continue
        failure = errorMessage(error)
      }
    }
    setAdding(false)
    if (added > 0) onAdded()
    if (failure) {
      toast.error(failure)
      return
    }
    toast.success(added === 0 ? 'Déjà dans « À planifier »' : `${added} ${added > 1 ? 'idées ajoutées' : 'idée ajoutée'} à « À planifier »`)
    onOpenChange(false)
  }

  const count = selected.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" aria-hidden /> Idées de repas
          </DialogTitle>
          <DialogDescription>Coche celles qui te plaisent : elles iront dans « À planifier ».</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 overflow-y-auto px-1">
          {state.kind === 'loading' && (
            <div role="status" aria-live="polite" className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Recherche d’idées… (jusqu’à une minute)
              </p>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          )}

          {state.kind === 'error' && (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p>{state.message}</p>
              <Button variant="outline" onClick={() => void search()}>
                <RefreshCw /> Réessayer
              </Button>
            </div>
          )}

          {state.kind === 'ready' && (
            <ul className="space-y-2" aria-label="Idées proposées">
              {state.ideas.map((idea) => {
                const key = ideaKey(idea)
                const checkboxId = `idea-${key}`
                return (
                  <li key={key} className="flex gap-3 rounded-xl border p-3 has-[button[data-state=checked]]:border-brand/40 has-[button[data-state=checked]]:bg-brand/5">
                    <Checkbox id={checkboxId} checked={selected.has(key)} onCheckedChange={() => toggle(key)} className="mt-0.5 size-5" />
                    <div className="min-w-0 flex-1 space-y-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <label htmlFor={checkboxId} className="cursor-pointer font-medium">
                          {idea.title}
                        </label>
                        <Badge variant={idea.vegetarian ? 'secondary' : 'outline'}>{idea.vegetarian ? 'Végé' : 'Viande ou poisson'}</Badge>
                      </div>
                      <p className="text-muted-foreground">{[idea.protein, idea.vegetables.join(', '), idea.starch].filter(Boolean).join(' · ')}</p>
                      {idea.why && <p className="text-xs text-muted-foreground">{idea.why}</p>}
                      {idea.source === 'saved' ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-brand">
                          <BookOpen className="size-3.5" aria-hidden /> Tes recettes
                        </p>
                      ) : (
                        <a
                          href={idea.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex w-fit items-center gap-1 text-xs font-medium text-brand underline-offset-4 hover:underline"
                        >
                          <ExternalLink className="size-3.5" aria-hidden /> {idea.site}
                          <span className="sr-only"> (voir la recette « {idea.title} », nouvel onglet)</span>
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-10" disabled={state.kind === 'loading' || adding} onClick={() => void search()}>
            <RefreshCw /> Autres idées
          </Button>
          <Button className="h-10" disabled={state.kind !== 'ready' || count === 0 || adding} onClick={() => void add()}>
            {adding && <Loader2 className="animate-spin" aria-hidden />}
            Ajouter à « À planifier »{count > 0 && ` (${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { CalendarDays, Clock, Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatDay } from '@/lib/dates'
import {
  slotLabel,
  toRecipeSource,
  validateMealForm,
  type Meal,
  type MealFormValues,
  type MealRecipeSource,
  type Profile,
  type RecipeSummary,
  type SlotRef,
} from '@/lib/meals'
import { hasErrors } from '@/lib/recipes'
import { RecipePicker } from './RecipePicker'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: SlotRef
  meal: Meal | null
  profiles: Profile[]
  currentUserId: string | null
  savedRecipes: RecipeSummary[] | null
  onSubmit: (people: string[], source: MealRecipeSource) => Promise<boolean>
}

const NOTES_MAX = 2000

function initialValues(meal: Meal | null, currentUserId: string | null): MealFormValues {
  if (!meal) {
    return { people: currentUserId ? [currentUserId] : [], mode: 'adhoc', recipeId: null, title: '', notes: '', url: '' }
  }
  const { recipe } = meal
  if (recipe.is_saved) {
    return { people: [...meal.people], mode: 'saved', recipeId: recipe.id, title: '', notes: '', url: '' }
  }
  return { people: [...meal.people], mode: 'adhoc', recipeId: null, title: recipe.title, notes: recipe.notes ?? '', url: recipe.url ?? '' }
}

export function MealDialog({ open, onOpenChange, target, meal, profiles, currentUserId, savedRecipes, onSubmit }: Props) {
  const [values, setValues] = useState<MealFormValues>(() => initialValues(meal, currentUserId))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(initialValues(meal, currentUserId))
    }
  }, [open, meal, currentUserId])

  const errors = validateMealForm(values)
  // Le bouton Enregistrer reste désactivé tant que le formulaire est invalide ;
  // seules les erreurs qui ne sautent pas aux yeux sont affichées.
  const shown = { people: errors.people, url: errors.url }
  const set = <K extends keyof MealFormValues>(key: K, value: MealFormValues[K]) => setValues((v) => ({ ...v, [key]: value }))

  function togglePerson(id: string, checked: boolean) {
    setValues((v) => ({ ...v, people: checked ? [...new Set([...v.people, id])] : v.people.filter((p) => p !== id) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors(errors)) return
    setSaving(true)
    const ok = await onSubmit(values.people, toRecipeSource(values))
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{meal ? 'Modifier le repas' : 'Ajouter un repas'}</DialogTitle>
            <DialogDescription className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary">
                <CalendarDays aria-hidden />
                {formatDay(target.date)}
              </Badge>
              <Badge variant="secondary">
                <Clock aria-hidden />
                {slotLabel(target.slot)}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Pour qui ?</legend>
            <div className="flex flex-wrap gap-2">
              {profiles.map((profile) => {
                const checked = values.people.includes(profile.id)
                return (
                  <label
                    key={profile.id}
                    className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-data-checked:border-foreground/30 has-data-checked:bg-muted"
                  >
                    <Checkbox checked={checked} onCheckedChange={(c) => togglePerson(profile.id, c)} />
                    {profile.display_name}
                  </label>
                )
              })}
            </div>
            {shown.people && <p className="text-sm text-destructive">{shown.people}</p>}
          </fieldset>

          <Tabs value={values.mode} onValueChange={(mode) => set('mode', mode as MealFormValues['mode'])}>
            <TabsList className="w-full">
              <TabsTrigger value="adhoc">Recette ponctuelle</TabsTrigger>
              <TabsTrigger value="saved">Recette sauvegardée</TabsTrigger>
            </TabsList>

            <TabsContent value="adhoc" className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meal-title">Titre</Label>
                <Input
                  id="meal-title"
                  value={values.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Ex. Curry de légumes, riz et yaourt"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="meal-notes">Notes</Label>
                  <span className="text-xs text-muted-foreground" aria-live="polite">
                    {values.notes.length}/{NOTES_MAX}
                  </span>
                </div>
                <Textarea
                  id="meal-notes"
                  value={values.notes}
                  maxLength={NOTES_MAX}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={4}
                  placeholder="Détails, idées, liens…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meal-url">Lien de la recette</Label>
                <Input
                  id="meal-url"
                  type="url"
                  inputMode="url"
                  value={values.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://"
                  aria-invalid={Boolean(shown.url) || undefined}
                  className="h-10"
                />
                {shown.url && <p className="text-sm text-destructive">{shown.url}</p>}
              </div>
            </TabsContent>

            <TabsContent value="saved" className="mt-3 space-y-2">
              <RecipePicker
                recipes={savedRecipes}
                value={values.recipeId}
                onChange={(id) => set('recipeId', id)}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || hasErrors(errors)}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Blocs du formulaire de recette : doublon de lien, choix parmi les recettes d'une page, temps, valeurs nutritionnelles.

import { ArrowRightLeft, CopyCheck, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { DURATION_FIELDS, MACRO_FIELDS, NUTRITION_BASES, type ImportedRecipe, type NutritionBasis, type RecipeFormErrors, type RecipeFormValues } from '@/lib/recipes'
import { cn } from '@/lib/utils'

type Set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) => void

/** Lien déjà utilisé par une recette enregistrée ; une recette ponctuelle du planning peut passer sur celle-là. */
export function DuplicateRecipeAlert({
  duplicate,
  canSwitch,
  switching,
  onSwitch,
}: {
  duplicate: { id: string; title: string }
  canSwitch: boolean
  switching: boolean
  onSwitch: () => void
}) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CopyCheck className="size-4 shrink-0 text-destructive" aria-hidden />
        Cette recette est déjà enregistrée : « {duplicate.title} »
      </p>
      <p className="mt-1 text-muted-foreground">
        {canSwitch ? 'Le planning peut utiliser cette recette à la place de la recette ponctuelle.' : 'Un même lien ne peut être utilisé que par une seule recette.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canSwitch && (
          <Button type="button" className="h-10 px-4" disabled={switching} onClick={onSwitch}>
            {switching ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRightLeft aria-hidden />}
            Utiliser « {duplicate.title} » dans le planning
          </Button>
        )}
        <Link to={`/recettes/${duplicate.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-4')}>
          Ouvrir « {duplicate.title} »
        </Link>
      </div>
    </div>
  )
}

/** Plusieurs recettes lues sur la même page : laquelle préremplir. */
export function PageRecipesChooser({ recipes, onChoose }: { recipes: ImportedRecipe[]; onChoose: (recipe: ImportedRecipe) => void }) {
  return (
    <section aria-labelledby="page-recipes-title" className="rounded-2xl border border-brand/25 bg-brand/5 p-4">
      <h2 id="page-recipes-title" className="text-sm font-semibold">
        Cette page contient {recipes.length} recettes : laquelle préremplir ?
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Pour les autres, relis la même photo ensuite, ou utilise l’import en série.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {recipes.map((recipe, i) => (
          <Button key={i} type="button" variant="outline" className="h-10 px-3" onClick={() => onChoose(recipe)}>
            {recipe.title}
          </Button>
        ))}
      </div>
    </section>
  )
}

/** Temps de préparation, repos et cuisson, saisis librement (« 45 min », « 1 h 30 »). */
export function DurationFields({ values, errors, set }: { values: RecipeFormValues; errors: RecipeFormErrors; set: Set }) {
  return (
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
            aria-invalid={Boolean(errors[field]) || undefined}
            className="h-10 placeholder:text-muted-foreground/40"
          />
        </div>
      ))}
      {DURATION_FIELDS.some(({ field }) => errors[field]) && (
        <p className="col-span-3 text-sm text-destructive">{DURATION_FIELDS.map(({ field }) => errors[field]).find(Boolean)}</p>
      )}
    </fieldset>
  )
}

/** Calories, glucides, protéines, lipides, et leur base (portion, recette, 100 g). */
export function NutritionFields({ values, errors, set }: { values: RecipeFormValues; errors: RecipeFormErrors; set: Set }) {
  return (
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
          aria-invalid={Boolean(errors.nutrition) || undefined}
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
            aria-invalid={Boolean(errors.nutrition) || undefined}
            className="h-10"
          />
        </div>
      ))}
      <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
        <Label htmlFor="recipe-nutrition-per" className="text-xs font-normal text-muted-foreground">
          Valeurs
        </Label>
        <NativeSelect id="recipe-nutrition-per" value={values.nutritionPer} onChange={(e) => set('nutritionPer', e.target.value as NutritionBasis)} className="h-9 px-2">
          {NUTRITION_BASES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {errors.nutrition && <p className="col-span-2 text-sm text-destructive sm:col-span-4">{errors.nutrition}</p>}
    </fieldset>
  )
}

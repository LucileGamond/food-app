import { pageReference, type ImportedRecipe, type IngredientDraft, type RecipeFormValues } from './recipes'
import { isPantry } from './shoppingFromPlan'

/** Point à vérifier après un import (lien ou photo), sur un ingrédient ou sur la recette. */
export interface ImportCheck {
  key: string
  /** Ligne d'ingrédient concernée (clé du formulaire), ou null pour la recette. */
  ingredientKey: string | null
  /** Champ de la recette concerné, quand ce n'est pas un ingrédient. */
  field: 'servings' | 'notes' | null
  message: string
}

/**
 * Ce qui semble à vérifier juste après l'import : points signalés par le modèle (passage illisible, quantité
 * approximative…), plus des contrôles de l'application (quantité absente, renvoi à une autre page, portions ou
 * étapes non trouvées). `values` est le formulaire tel que l'import vient de le remplir.
 */
export function importChecks(imported: Pick<ImportedRecipe, 'checks'>, values: RecipeFormValues): ImportCheck[] {
  const checks: ImportCheck[] = []
  const add = (ingredientKey: string | null, field: ImportCheck['field'], message: string) => {
    const owner = ingredientKey ?? field ?? 'recette'
    if (checks.some((c) => (c.ingredientKey ?? c.field ?? 'recette') === owner && c.message === message)) return
    checks.push({ key: `${owner}-${checks.length}`, ingredientKey, field, message })
  }

  // Les titres de sous-parties ne sont pas des ingrédients : la position du modèle porte sur les ingrédients seuls.
  const rows = values.ingredients.filter((r) => !r.heading)
  for (const check of imported.checks ?? []) {
    const row = check.ingredient === null ? undefined : rows[check.ingredient]
    add(row?.key ?? null, null, check.message)
  }

  rows.forEach((row) => {
    if (!row.name.trim()) return
    if (pageReference(row)) add(row.key, null, 'Renvoie à une autre page : recette à importer après l’enregistrement')
    if (row.quantity === '' && /\d/.test(row.note)) add(row.key, null, 'Quantité dans la précision : à reporter si possible')
    else if (row.quantity === '' && !isPantry(row.name)) add(row.key, null, 'Quantité non trouvée')
  })

  if (values.servings === '') add(null, 'servings', 'Nombre de portions non trouvé')
  if (values.notes.trim() === '') add(null, 'notes', 'Étapes de préparation non trouvées')
  return checks
}

/** Un point disparaît dès que la personne a corrigé la ligne ou le champ concerné. */
export function pendingChecks(checks: readonly ImportCheck[], snapshot: RecipeFormValues, values: RecipeFormValues): ImportCheck[] {
  const sameRow = (key: string) => {
    const before = snapshot.ingredients.find((r) => r.key === key)
    const now = values.ingredients.find((r) => r.key === key)
    return Boolean(before && now) && rowText(before!) === rowText(now!)
  }
  return checks.filter((c) => {
    if (c.ingredientKey) return sameRow(c.ingredientKey)
    if (c.field) return values[c.field] === snapshot[c.field]
    return true
  })
}

const rowText = (row: IngredientDraft) => [row.name, row.quantity, row.unit, row.note].join('|')

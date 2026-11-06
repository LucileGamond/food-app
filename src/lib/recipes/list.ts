// Liste des recettes enregistrées : recherche et tags.

import type { IsoDate } from '../dates'
import { foldText } from '../text'
import { normalizeTags, type NutritionBasis } from './model'

export interface RecipeListItem {
  id: string
  title: string
  tags: string[]
  ingredientNames: string[]
  mainPhotoPath: string | null
  createdAt: string
  source: string | null
  sourcePage: string | null
  url: string | null
  /** Préparation, repos et cuisson ; null si aucun temps n'est renseigné. */
  totalMinutes: number | null
  kcal: number | null
  nutritionPer: NutritionBasis | null
  vegetarian: boolean
  /** Repas passés du planning (jusqu'à aujourd'hui inclus). */
  timesCooked: number
  lastCooked: IsoDate | null
  nextPlanned: IsoDate | null
  /** Moyenne des notes de chacun ; null sans note. */
  rating: number | null
}

/** Recherche sans accents ni casse dans le titre et les ingrédients, puis filtre par tag. */
export function filterRecipes<T extends Pick<RecipeListItem, 'title' | 'tags' | 'ingredientNames'>>(
  recipes: readonly T[],
  query: string,
  tag: string | null,
): T[] {
  const q = foldText(query)
  const t = tag ? foldText(tag) : null
  return recipes.filter((r) => {
    if (t && !r.tags.some((x) => foldText(x) === t)) return false
    if (!q) return true
    return foldText(r.title).includes(q) || r.ingredientNames.some((n) => foldText(n).includes(q))
  })
}

/** Tous les tags distincts, triés. */
export function collectTags(recipes: readonly Pick<RecipeListItem, 'tags'>[]): string[] {
  return normalizeTags(recipes.flatMap((r) => r.tags)).sort((a, b) => a.localeCompare(b, 'fr'))
}

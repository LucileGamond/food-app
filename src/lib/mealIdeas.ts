import { addDays, type IsoDate } from './dates'
import type { Meal } from './meals'
import type { RecipeListItem } from './recipes'

/** Une recette enregistrée mangée (ou prévue) depuis moins de 15 jours n'est pas reproposée. */
export const RECENT_DAYS = 15
/** Repas déjà prévus pris en compte. */
export const UPCOMING_DAYS = 7
const MAX_CANDIDATES = 80
const MAX_RECENT = 40

/** Ce que reçoit la fonction suggest-meals. */
export interface MealIdeasInput {
  today: IsoDate
  candidates: { id: string; title: string; ingredients: string[]; tags: string[] }[]
  recent: string[]
}

interface MealIdeaBase {
  title: string
  protein: string
  vegetables: string[]
  starch: string
  vegetarian: boolean
  why: string
}

/** Idée renvoyée : une recette enregistrée, ou une recette trouvée sur internet. */
export type MealIdea = MealIdeaBase & ({ source: 'saved'; recipeId: string } | { source: 'web'; url: string; site: string })

/** Période dont les repas comptent comme récents ou déjà prévus. */
export function ideasPeriod(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -RECENT_DAYS), to: addDays(today, UPCOMING_DAYS) }
}

/**
 * Recettes enregistrées à proposer (sauf celles mangées ou prévues sur la période) et plats récents à éviter.
 * `meals` : les repas de `ideasPeriod(today)`.
 */
export function buildIdeasInput(today: IsoDate, recipes: readonly RecipeListItem[], meals: readonly Meal[]): MealIdeasInput {
  const used = new Set(meals.map((m) => m.recipe.id))
  const recent = [...new Set(meals.map((m) => m.recipe.title.trim()).filter(Boolean))]
  return {
    today,
    candidates: recipes
      .filter((r) => !used.has(r.id))
      .slice(0, MAX_CANDIDATES)
      .map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredientNames.slice(0, 15), tags: r.tags.slice(0, 5) })),
    recent: recent.slice(0, MAX_RECENT),
  }
}

const text = (v: unknown): v is string => typeof v === 'string'

/** Nom d'hôte d'une adresse http(s), ou null si elle n'en est pas une. */
function webHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.hostname : null
  } catch {
    return null
  }
}

/** Idées reçues de la fonction : celles qui n'ont pas la forme attendue (autre version de la fonction) sont écartées. */
export function parseIdeas(raw: unknown): MealIdea[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value): MealIdea[] => {
    const idea = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    if (!text(idea.title) || !idea.title.trim()) return []
    const base = {
      title: idea.title,
      protein: text(idea.protein) ? idea.protein : '',
      vegetables: Array.isArray(idea.vegetables) ? idea.vegetables.filter(text) : [],
      starch: text(idea.starch) ? idea.starch : '',
      vegetarian: idea.vegetarian === true,
      why: text(idea.why) ? idea.why : '',
    }
    if (idea.source === 'saved' && text(idea.recipeId)) return [{ ...base, source: 'saved', recipeId: idea.recipeId }]
    const host = idea.source === 'web' && text(idea.url) ? webHost(idea.url) : null
    if (host && text(idea.url)) return [{ ...base, source: 'web', url: idea.url, site: text(idea.site) && idea.site.trim() ? idea.site : host }]
    return []
  })
}

/** Clé stable d'une idée (pour les cases à cocher). */
export function ideaKey(idea: MealIdea): string {
  return idea.source === 'saved' ? `saved:${idea.recipeId}` : `web:${idea.url}`
}

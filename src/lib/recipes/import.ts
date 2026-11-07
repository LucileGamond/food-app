// Import d'une recette (lien, photo, texte) par la fonction import-recipe : conversion en formulaire.

import { isUnit, metricText, splitUnit, toMetric } from '../units'
import { formatQuantity, isNutritionBasis, normalizeTags, SERVINGS_MAX, type Ingredient } from './model'
import { recipeToFormValues, type RecipeFormValues } from './form'
import { splitSource } from './links'

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: Ingredient[]
  steps: string
  tags: string[]
  /** Points signalés par le modèle (`ingredient` : position dans `ingredients`). Absent avec une ancienne version. */
  checks?: { ingredient: number | null; message: string }[]
  /** Livre lu sur la photo (une ancienne version de la fonction y met aussi la page : « Pâtisserie maison, p. 146 »). */
  source?: string | null
  /** Page lue sur la photo (« 146 »). Absente avec une ancienne version de la fonction. */
  page?: string | null
  /** Valeurs nutritionnelles indiquées par la recette. Absentes avec une ancienne version de la fonction. */
  nutrition?: { per: string | null; kcal: number | null; carbs: number | null; protein: number | null; fat: number | null } | null
  prep_minutes?: number | null
  rest_minutes?: number | null
  cook_minutes?: number | null
  /** Photo lue : cadre de la photo du plat sur l'image envoyée (absent sinon, ou avec une ancienne version). */
  photo?: PhotoArea | null
}

/** Cadre d'une photo dans une image : numéro de l'image et bords en fractions de sa largeur et hauteur. */
interface PhotoArea {
  image: number
  left: number
  top: number
  right: number
  bottom: number
  /** Quart de tour (sens horaire) qui remet la photo à l'endroit ; absent avec une ancienne version de la fonction. */
  rotation?: 0 | 90 | 180 | 270
}

export interface RecipeImport {
  /** La recette (la première de la page pour une photo). */
  recipe: ImportedRecipe
  /** Photo : toutes les recettes de la page, dans l'ordre. Absent avec une ancienne version de la fonction. */
  recipes?: ImportedRecipe[]
  source: 'structured' | 'text' | 'photo' | 'video'
  image: { data: string; type: string } | null
  /** Vidéo : page où la recette écrite a été trouvée (la description ne la donnait pas). */
  foundUrl?: string
}

/** Publication Instagram : sa légende ne peut pas être lue, elle est collée par la personne. */
export function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value.trim()).hostname
    return /(^|\.)instagram\.com$/.test(host) || host === 'instagr.am'
  } catch {
    return false
  }
}

/** Vidéo YouTube : la recette est lue dans la description, ou cherchée en ligne (plus long). */
export function isYoutubeUrl(value: string): boolean {
  try {
    return /(^|\.)(youtube\.com|youtube-nocookie\.com)$|^youtu\.be$/.test(new URL(value.trim()).hostname)
  } catch {
    return false
  }
}

/**
 * Unité ramenée à la liste : unité anglaise convertie (4 oz → 115 g), variante reconnue (« cuillères à soupe » → c. à s.,
 * mots en plus dans la précision), sinon quantité et unité déplacées dans la précision (« 1 shot »).
 */
export function normalizeIngredientUnit(ingredient: Ingredient): Ingredient {
  const note = ingredient.note?.trim() || null
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(', ') || null
  if (!ingredient.unit || isUnit(ingredient.unit)) return { ...ingredient, unit: ingredient.unit || null, note }
  const metric = toMetric(ingredient.quantity, ingredient.unit)
  if (metric) return { ...ingredient, quantity: metric.quantity, unit: metric.unit, note: join(metric.rest, note) }
  const split = splitUnit(ingredient.unit)
  if (split) return { ...ingredient, unit: split.unit, note: join(split.rest, note) }
  const lost = [formatQuantity(ingredient.quantity), ingredient.unit.trim()].filter(Boolean).join(' ')
  return { ...ingredient, quantity: null, unit: null, note: join(lost, note) }
}

/** Livre et page d'une recette importée (découpés si la fonction les a réunis dans la source). */
function importedSource(imported: ImportedRecipe): { source: string | null; source_page: string | null } {
  const source = imported.source?.trim() || null
  const page = imported.page?.trim() || null
  if (page || !source) return { source, source_page: page }
  const split = splitSource(source)
  return split ? { source: split.source || null, source_page: split.page } : { source, source_page: null }
}

/** Remplace le contenu du formulaire par la recette importée ; le lien devient l'adresse importée. */
export function importedToFormValues(imported: ImportedRecipe, url: string): RecipeFormValues {
  return recipeToFormValues({
    title: imported.title,
    servings: imported.servings !== null && imported.servings <= SERVINGS_MAX ? imported.servings : null,
    // Recette anglaise : températures et dimensions en métrique (les quantités le sont par `normalizeIngredientUnit`).
    notes: imported.steps ? metricText(imported.steps) : null,
    url,
    tags: normalizeTags(imported.tags),
    ...importedSource(imported),
    prep_minutes: imported.prep_minutes ?? null,
    rest_minutes: imported.rest_minutes ?? null,
    cook_minutes: imported.cook_minutes ?? null,
    nutrition_per: isNutritionBasis(imported.nutrition?.per) ? imported.nutrition.per : null,
    kcal: imported.nutrition?.kcal ?? null,
    carbs_g: imported.nutrition?.carbs ?? null,
    protein_g: imported.nutrition?.protein ?? null,
    fat_g: imported.nutrition?.fat ?? null,
    ingredients: imported.ingredients.map((i) => normalizeIngredientUnit({ ...i, note: i.note ? metricText(i.note) : i.note })),
  })
}

/** Photo renvoyée par l'import (base64) → fichier, comme une photo choisie à la main. */
export function importedImageToFile(image: { data: string; type: string }, name = 'photo-importee'): File {
  const binary = atob(image.data)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([bytes], `${name}.${extension}`, { type: image.type })
}

/** « https://www.marmiton.org/… » → « marmiton.org » */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

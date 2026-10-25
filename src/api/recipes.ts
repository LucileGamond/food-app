import type { IsoDate } from '@/lib/dates'
import type { MealSlot, RecipeSummary } from '@/lib/meals'
import type { Ingredient, Recipe, RecipeImport, RecipeListItem, SaveRecipeInput } from '@/lib/recipes'
import type { AppSupabaseClient } from '@/lib/supabase'
import { PHOTO_BUCKET } from './photos'
import { AppError, DuplicateRecipeUrlError, RecipeInUseError, toAppError } from './errors'

export interface RecipeUsage {
  meal_date: IsoDate
  slot: MealSlot
}

/** Erreur renvoyée par l'Edge Function import-recipe → message affichable. */
async function importError(error: { name?: string; context?: unknown }): Promise<AppError> {
  const response = error.context instanceof Response ? error.context : null
  if (!response) return new AppError('Connexion impossible. Vérifie ta connexion internet.', 'network')
  if (response.status === 401) return new AppError('Ta session a expiré. Reconnecte-toi.', 'import-401')
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  const message = typeof body?.error === 'string' ? body.error : "L'import de la recette a échoué."
  return new AppError(message, `import-${response.status}`)
}

export function createRecipesApi(db: AppSupabaseClient) {
  /** Recette sauvegardée qui utilise déjà ce lien (hors `excludeId`), ou null. */
  async function findSavedByUrl(url: string, excludeId?: string | null): Promise<{ id: string; title: string } | null> {
    const { data, error } = await db.rpc('find_saved_recipe_by_url', { p_url: url, p_exclude: excludeId ?? undefined })
    if (error) throw toAppError(error, 'Impossible de vérifier le lien de la recette.')
    return data[0] ?? null
  }

  return {
    /** Recettes sauvegardées uniquement (les ponctuelles n'apparaissent que dans le planning). */
    async listSavedRecipes(): Promise<RecipeListItem[]> {
      const { data, error } = await db
        .from('recipes')
        .select('id, title, tags, recipe_ingredients(name), recipe_photos(storage_path, position)')
        .eq('is_saved', true)
        .order('title')
      if (error) throw toAppError(error, 'Impossible de charger les recettes.')
      return data.map((r) => ({
        id: r.id,
        title: r.title,
        tags: r.tags,
        ingredientNames: r.recipe_ingredients.map((i) => i.name),
        mainPhotoPath: [...r.recipe_photos].sort((a, b) => a.position - b.position)[0]?.storage_path ?? null,
      }))
    },

    /** Recettes sauvegardées proposées dans le planning. */
    async listSavedSummaries(): Promise<RecipeSummary[]> {
      const { data, error } = await db
        .from('recipes')
        .select('id, is_saved, title, notes, url, tags')
        .eq('is_saved', true)
        .order('title')
      if (error) throw toAppError(error, 'Impossible de charger les recettes.')
      return data
    },

    async getRecipe(id: string): Promise<Recipe | null> {
      const { data, error } = await db
        .from('recipes')
        .select('id, is_saved, title, notes, url, servings, tags, recipe_ingredients(name, quantity, unit, note, position), recipe_photos(id, storage_path, position)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger la recette.')
      if (!data) return null
      const { recipe_ingredients, recipe_photos, ...recipe } = data
      return {
        ...recipe,
        ingredients: [...recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map(({ name, quantity, unit, note }) => ({ name, quantity, unit, note })),
        photos: [...recipe_photos].sort((a, b) => a.position - b.position),
      }
    },

    /** Nombre de personnes et ingrédients de plusieurs recettes (liste de courses), en une requête. */
    async getIngredients(ids: string[]): Promise<{ id: string; servings: number | null; ingredients: Ingredient[] }[]> {
      if (ids.length === 0) return []
      const { data, error } = await db.from('recipes').select('id, servings, recipe_ingredients(name, quantity, unit, note, position)').in('id', ids)
      if (error) throw toAppError(error, 'Impossible de charger les ingrédients.')
      return data.map(({ recipe_ingredients, ...recipe }) => ({
        ...recipe,
        ingredients: [...recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map(({ name, quantity, unit, note }) => ({ name, quantity, unit, note })),
      }))
    },

    /** Crée ou met à jour une recette sauvegardée (et transforme une recette ponctuelle si `id` en est une). */
    async saveRecipe(input: SaveRecipeInput): Promise<string> {
      const { data, error } = await db.rpc('save_recipe', {
        p_recipe_id: input.id ?? undefined,
        p_title: input.title,
        p_notes: input.notes ?? '',
        p_url: input.url ?? '',
        p_servings: input.servings ?? undefined,
        p_tags: input.tags,
        p_ingredients: input.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity === null ? '' : String(i.quantity),
          unit: i.unit ?? '',
          note: i.note ?? '',
        })),
      })
      if (error?.code === '23505' && input.url) {
        const existing = await findSavedByUrl(input.url, input.id)
        if (existing) throw new DuplicateRecipeUrlError(existing)
      }
      if (error) throw toAppError(error, "Impossible d'enregistrer la recette.")
      return data
    },

    findSavedByUrl,

    /** Les repas qui utilisent la recette ponctuelle passent sur la recette sauvegardée ; renvoie leur nombre. */
    async useSavedRecipe(adhocId: string, savedId: string): Promise<number> {
      const { data, error } = await db.rpc('use_saved_recipe', { p_adhoc_id: adhocId, p_saved_id: savedId })
      if (error) throw toAppError(error, 'Impossible de remplacer la recette.')
      return data
    },

    /** Dates du planning qui utilisent la recette. */
    async listUsages(id: string): Promise<RecipeUsage[]> {
      const { data, error } = await db
        .from('meals')
        .select('meal_date, slot')
        .eq('recipe_id', id)
        .order('meal_date')
        .order('slot')
      if (error) throw toAppError(error, 'Impossible de vérifier le planning.')
      return data
    },

    /** Supprime la recette et ses photos. Refusé si un repas l'utilise. */
    async deleteRecipe(id: string): Promise<void> {
      const { data: photos, error: photosError } = await db.from('recipe_photos').select('storage_path').eq('recipe_id', id)
      if (photosError) throw toAppError(photosError, 'Impossible de supprimer la recette.')

      const { error } = await db.from('recipes').delete().eq('id', id)
      if (error) {
        if (error.code === '23503') throw new RecipeInUseError()
        throw toAppError(error, 'Impossible de supprimer la recette.')
      }

      if (photos.length > 0) {
        // Les fichiers orphelins ne gênent pas l'application : un échec ici n'est pas bloquant.
        await db.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.storage_path))
      }
    },

    /** Tous les tags déjà utilisés, pour l'autocomplétion. */
    async listTags(): Promise<string[]> {
      const { data, error } = await db.from('recipes').select('tags').eq('is_saved', true)
      if (error) throw toAppError(error, 'Impossible de charger les tags.')
      const tags = new Map<string, string>()
      for (const row of data) for (const tag of row.tags) tags.set(tag.toLocaleLowerCase('fr-FR'), tag)
      return [...tags.values()].sort((a, b) => a.localeCompare(b, 'fr'))
    },

    /** Analyse une page de recette (Edge Function + modèle) pour préremplir le formulaire. */
    async importFromUrl(url: string, knownTags: string[] = []): Promise<RecipeImport> {
      const { data, error } = await db.functions.invoke<RecipeImport>('import-recipe', { body: { url, knownTags } })
      if (error) throw await importError(error)
      if (!data?.recipe) throw new AppError("L'import de la recette a échoué.")
      return data
    },
  }
}

export type RecipesApi = ReturnType<typeof createRecipesApi>

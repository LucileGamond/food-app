import type { IsoDate } from '@/lib/dates'
import type { MealSlot, RecipeSummary } from '@/lib/meals'
import type { Ingredient, LinkedRecipe, Recipe, RecipeImport, RecipeListItem, SaveRecipeInput } from '@/lib/recipes'
import type { AppSupabaseClient } from '@/lib/supabase'
import { PHOTO_BUCKET } from './photos'
import { AppError, DuplicateRecipeUrlError, functionError, RecipeInUseError, toAppError } from './errors'

export interface RecipeUsage {
  meal_date: IsoDate
  slot: MealSlot
}

/** Ce qui empêche de supprimer une recette : les repas du planning et les recettes qui l'utilisent. */
export interface RecipeUsages {
  meals: RecipeUsage[]
  recipes: LinkedRecipe[]
}

/** Au-delà, la connexion est sans doute bloquée : mieux vaut le dire que laisser tourner. */
const IMPORT_TIMEOUT_MS = 100_000

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
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
        .select(
          'id, is_saved, title, notes, url, servings, tags, source, prep_minutes, rest_minutes, cook_minutes, recipe_ingredients(name, quantity, unit, note, section, position, linked_recipe_id), recipe_photos(id, storage_path, position)',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw toAppError(error, 'Impossible de charger la recette.')
      if (!data) return null
      const { recipe_ingredients, recipe_photos, ...recipe } = data
      // Titres des sous-recettes liées (pas de relation déclarée : voir la migration recipe_links).
      const linkedIds = [...new Set(recipe_ingredients.flatMap((i) => (i.linked_recipe_id ? [i.linked_recipe_id] : [])))]
      const titles = new Map<string, string>()
      if (linkedIds.length > 0) {
        const linked = await db.from('recipes').select('id, title').in('id', linkedIds).eq('is_saved', true)
        if (linked.error) throw toAppError(linked.error, 'Impossible de charger la recette.')
        for (const r of linked.data) titles.set(r.id, r.title)
      }
      return {
        ...recipe,
        ingredients: [...recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map(({ name, quantity, unit, note, section, linked_recipe_id }) => {
            const title = linked_recipe_id ? titles.get(linked_recipe_id) : undefined
            return { name, quantity, unit, note, section, linkedRecipe: title ? { id: linked_recipe_id!, title } : null }
          }),
        photos: [...recipe_photos].sort((a, b) => a.position - b.position),
      }
    },

    /** Sources déjà utilisées (livres, magazines), pour les proposer à la saisie. */
    async listSources(): Promise<string[]> {
      const { data, error } = await db.from('recipes').select('source').eq('is_saved', true).not('source', 'is', null)
      if (error) throw toAppError(error, 'Impossible de charger les sources.')
      return [...new Set(data.map((r) => r.source!.trim()))].sort((a, b) => a.localeCompare(b, 'fr'))
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
        // '' et 0 effacent ; absent (ancienne version de l'application) conserve la valeur enregistrée.
        p_source: input.source ?? '',
        p_prep_minutes: input.prepMinutes ?? 0,
        p_rest_minutes: input.restMinutes ?? 0,
        p_cook_minutes: input.cookMinutes ?? 0,
        p_ingredients: input.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity === null ? '' : String(i.quantity),
          unit: i.unit ?? '',
          note: i.note ?? '',
          section: i.section ?? '',
          linked_recipe_id: i.linkedRecipe?.id ?? '',
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

    /**
     * Lie un ingrédient à une sous-recette sauvegardée, ou retire le lien (null). L'ingrédient est désigné par sa
     * position et son nom : si la recette a changé entre-temps, rien n'est lié au mauvais ingrédient.
     */
    async linkIngredient(recipeId: string, ingredient: { position: number; name: string }, linkedRecipeId: string | null): Promise<void> {
      const { error } = await db.rpc('link_recipe_ingredient', {
        p_recipe_id: recipeId,
        p_position: ingredient.position,
        p_name: ingredient.name,
        // null (retirer le lien) est accepté par la fonction ; les types générés ne le prévoient pas.
        p_linked_recipe_id: linkedRecipeId as string,
      })
      if (error?.code === 'P0002') {
        throw new AppError(
          error.message === 'Recette liée introuvable'
            ? 'Cette recette n’existe plus : elle a peut-être été supprimée.'
            : 'La recette a été modifiée entre-temps : recharge-la puis réessaie.',
          'P0002',
        )
      }
      if (error) throw toAppError(error, 'Impossible de lier la recette.')
    },

    /** Les repas qui utilisent la recette ponctuelle passent sur la recette sauvegardée ; renvoie leur nombre. */
    async useSavedRecipe(adhocId: string, savedId: string): Promise<number> {
      const { data, error } = await db.rpc('use_saved_recipe', { p_adhoc_id: adhocId, p_saved_id: savedId })
      if (error) throw toAppError(error, 'Impossible de remplacer la recette.')
      return data
    },

    /** Dates du planning qui utilisent la recette. */
    async listUsages(id: string): Promise<RecipeUsages> {
      const [meals, links] = await Promise.all([
        db.from('meals').select('meal_date, slot').eq('recipe_id', id).order('meal_date').order('slot'),
        db.from('recipe_ingredients').select('recipes(id, title)').eq('linked_recipe_id', id),
      ])
      if (meals.error) throw toAppError(meals.error, 'Impossible de vérifier le planning.')
      if (links.error) throw toAppError(links.error, 'Impossible de vérifier les recettes liées.')
      const recipes = new Map<string, LinkedRecipe>()
      for (const { recipes: recipe } of links.data) if (recipe) recipes.set(recipe.id, recipe)
      return { meals: meals.data, recipes: [...recipes.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr')) }
    },

    /** Supprime la recette et ses photos. Refusé si un repas ou une autre recette l'utilise. */
    async deleteRecipe(id: string): Promise<void> {
      const { data: photos, error: photosError } = await db.from('recipe_photos').select('storage_path').eq('recipe_id', id)
      if (photosError) throw toAppError(photosError, 'Impossible de supprimer la recette.')

      const { error } = await db.from('recipes').delete().eq('id', id)
      if (error) {
        if (error.code === '23503') throw new RecipeInUseError(error.message.includes('autre recette') ? 'recipe' : 'planning')
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

    /** Lit une recette sur 1 ou 2 photos (page de livre, scan), déjà réduites, pour préremplir le formulaire. */
    async importFromPhotos(photos: Blob[], knownTags: string[] = []): Promise<RecipeImport> {
      const images = await Promise.all(photos.map(async (photo) => ({ type: photo.type || 'image/jpeg', data: await toBase64(photo) })))
      const { data, error } = await db.functions.invoke<RecipeImport>('import-recipe', { body: { mode: 'photos', images, knownTags }, timeout: IMPORT_TIMEOUT_MS })
      if (error) throw await functionError(error, 'La lecture de la photo a échoué.', 'import')
      if (!data?.recipe) throw new AppError("La lecture de la photo a échoué.")
      return data
    },

    /** Analyse une page de recette (Edge Function + modèle) pour préremplir le formulaire. */
    async importFromUrl(url: string, knownTags: string[] = []): Promise<RecipeImport> {
      const { data, error } = await db.functions.invoke<RecipeImport>('import-recipe', { body: { url, knownTags }, timeout: IMPORT_TIMEOUT_MS })
      if (error) throw await functionError(error, "L'import de la recette a échoué.", 'import')
      if (!data?.recipe) throw new AppError("L'import de la recette a échoué.")
      return data
    },
  }
}

export type RecipesApi = ReturnType<typeof createRecipesApi>

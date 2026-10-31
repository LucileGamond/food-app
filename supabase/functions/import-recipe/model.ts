// Appel au modèle (API Messages d'Anthropic) pour transformer le contenu nettoyé en recette structurée.

import { callTool, HttpError, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import type { PageContent } from './extract.ts'

export { DEFAULT_MODEL } from '../_shared/anthropic.ts'
export type { ModelOptions, ModelUsage }
const MAX_KNOWN_TAGS = 40

/** Unités acceptées par l'application (identiques à src/lib/units.ts, vérifié par un test). */
export const UNITS = [
  'g', 'kg', 'ml', 'cl', 'dl', 'l', 'c. à c.', 'c. à s.', 'pincée', 'gousse', 'tranche', 'sachet', 'boîte', 'botte',
  'brin', 'feuille', 'verre', 'tasse', 'bol', 'poignée', 'noix', 'filet', 'morceau',
] as const

export interface ImportedIngredient {
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  /** Sous-partie de la recette (« Pour le streusel »). */
  section: string | null
}

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: ImportedIngredient[]
  steps: string
  tags: string[]
  /** Points à vérifier signalés par le modèle (ingrédient : position dans `ingredients`, ou null). */
  checks: ImportCheck[]
  /** Livre ou magazine (photo seulement). */
  source: string | null
  /** Numéro de page (photo seulement : « 146 »). */
  page: string | null
  /** Valeurs nutritionnelles indiquées par la recette. */
  nutrition: Nutrition | null
  prep_minutes: number | null
  rest_minutes: number | null
  cook_minutes: number | null
}

export const NUTRITION_BASES = ['portion', 'recette', '100 g'] as const

export interface Nutrition {
  per: (typeof NUTRITION_BASES)[number]
  kcal: number | null
  carbs: number | null
  protein: number | null
  fat: number | null
}

export interface ImportCheck {
  ingredient: number | null
  message: string
}

/** Recettes lues au plus sur une photo (une page de livre en contient rarement plus). */
export const MAX_PHOTO_RECIPES = 4

/** Erreur d'import : statut HTTP et message lisible. */
export const ImportError = HttpError
export type ImportError = HttpError

const TOOL_NAME = 'enregistrer_recette'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre la recette extraite de la page.',
  input_schema: {
    type: 'object',
    properties: {
      is_recipe: { type: 'boolean', description: 'false si la page ne contient pas de recette de cuisine.' },
      title: { type: 'string', description: 'Nom de la recette, sans le nom du site.' },
      servings: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Nombre de portions / personnes, null si inconnu.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingrédient seul, en minuscules, sans la quantité (ex. « farine », « œufs »).' },
            quantity: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Quantité numérique (½ → 0.5, « un » → 1), null si non précisée.' },
            unit: {
              anyOf: [{ type: 'string', enum: [...UNITS] }, { type: 'null' }],
              description:
                'Unité de la liste (cuillère à soupe → « c. à s. », à café → « c. à c. », grammes → « g »…) ; null pour un nombre de pièces (3 œufs). Unité absente de la liste : null, et la quantité avec son unité dans note.',
            },
            note: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Précision facultative : préparation (« émincés »), qualité (« bombée », « bio »), alternative, ou unité hors liste (« 1 shot »).',
            },
            section: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Sous-partie de la recette à laquelle appartient l’ingrédient, telle qu’écrite (« Pour le streusel »), null si la recette n’en a pas.',
            },
          },
          required: ['name', 'quantity', 'unit', 'note', 'section'],
        },
      },
      steps: { type: 'string', description: 'Étapes de préparation numérotées, une par ligne (« 1. … »), reformulées sans rien inventer.' },
      tags: { type: 'array', items: { type: 'string' }, description: '0 à 5 tags courts en minuscules (ex. végé, rapide, dessert).' },
      checks: {
        type: 'array',
        description:
          'Points que la personne doit vérifier, 0 à 8 : passage illisible ou deviné, quantité approximative (« 4 ou 5 »), renvoi à une autre recette (« voir p. 208 »), unité hors liste. Liste vide si tout est clair.',
        items: {
          type: 'object',
          properties: {
            ingredient: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Numéro de l’ingrédient concerné dans la liste (à partir de 0), null pour la recette en général.' },
            ingredient_name: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Nom de l’ingrédient concerné, recopié exactement comme dans ingredients ; null pour la recette en général.',
            },
            message: { type: 'string', description: 'Ce qu’il faut vérifier, en une phrase courte.' },
          },
          required: ['ingredient', 'ingredient_name', 'message'],
        },
      },
      prep_minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Temps de préparation en minutes, null si non indiqué.' },
      rest_minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Temps de repos, de réfrigération ou de levée en minutes, null si non indiqué.' },
      cook_minutes: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Temps de cuisson en minutes (pour une fourchette « 30 à 40 min », la valeur la plus longue), null si non indiqué.',
      },
      source: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Photo seulement : titre du livre ou du magazine s’il est visible (sans la page) ; null sinon, et pour une page web.',
      },
      page: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Photo seulement : numéro de page imprimé (« 146 », « 146-147 ») ; null s’il n’est pas lisible, et pour une page web.',
      },
      nutrition: {
        anyOf: [
          {
            type: 'object',
            properties: {
              per: { type: 'string', enum: [...NUTRITION_BASES], description: 'Ce à quoi se rapportent les valeurs : une portion, toute la recette, ou 100 g.' },
              kcal: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Calories (kcal).' },
              carbs: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Glucides, en grammes.' },
              protein: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Protéines, en grammes.' },
              fat: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Lipides, en grammes.' },
            },
            required: ['per', 'kcal', 'carbs', 'protein', 'fat'],
          },
          { type: 'null' },
        ],
        description: 'Valeurs nutritionnelles seulement si la recette les indique (calories, glucides, protéines, lipides) ; null sinon. Ne calcule rien.',
      },
    },
    required: ['is_recipe', 'title', 'servings', 'ingredients', 'steps', 'tags', 'checks', 'prep_minutes', 'rest_minutes', 'cook_minutes', 'source', 'page', 'nutrition'],
  },
}

const SYSTEM = [
  'Tu extrais une recette de cuisine à partir du contenu d’une page web, en français.',
  'N’invente rien : si une information manque, laisse-la vide ou null.',
  'Traduis en français si la page est dans une autre langue.',
  'Pour les tags, réutilise de préférence les tags existants fournis.',
  'Reprends les valeurs nutritionnelles (calories, glucides, protéines, lipides) si la page les donne, sans les calculer.',
  `Réponds uniquement en appelant l’outil ${TOOL_NAME}.`,
].join('\n')

/** Message envoyé au modèle : données structurées si possible, sinon texte nettoyé. */
export function buildUserMessage(content: PageContent, url: string, knownTags: readonly string[]): string {
  const tags = knownTags.slice(0, MAX_KNOWN_TAGS).join(', ')
  const header = [`Page : ${url}`, tags ? `Tags existants : ${tags}` : null].filter(Boolean).join('\n')
  if (content.structured) return `${header}\n\nDonnées structurées de la recette (JSON) :\n${JSON.stringify(content.structured)}`
  return `${header}${content.title ? `\nTitre de la page : ${content.title}` : ''}\n\nTexte de la page :\n${content.text}`
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Valeurs nutritionnelles plausibles (bornées comme en base), ou null si aucune. */
export function sanitizeNutrition(input: unknown): Nutrition | null {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const amount = (v: unknown, max: number, digits: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10 ** digits) / 10 ** digits : null
  const nutrition: Nutrition = {
    per: (NUTRITION_BASES as readonly unknown[]).includes(data.per) ? (data.per as Nutrition['per']) : 'portion',
    kcal: amount(data.kcal, 20_000, 0),
    carbs: amount(data.carbs, 5000, 1),
    protein: amount(data.protein, 5000, 1),
    fat: amount(data.fat, 5000, 1),
  }
  return [nutrition.kcal, nutrition.carbs, nutrition.protein, nutrition.fat].some((v) => v !== null) ? nutrition : null
}

/** Ne garde que des valeurs sûres et bornées, quel que soit ce que renvoie le modèle. */
export function sanitizeRecipe(input: unknown, fallbackTitle: string | null, notFound = 'Aucune recette trouvée sur cette page.'): ImportedRecipe {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  if (data.is_recipe === false) throw new ImportError(notFound, 422)

  // Position d'origine de chaque ingrédient gardé : les points à vérifier y font référence.
  const kept: number[] = []
  const ingredients = (Array.isArray(data.ingredients) ? data.ingredients : [])
    .slice(0, 60)
    .map((raw, index): ImportedIngredient | null => {
      const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      const name = str(item.name, 120)
      if (!name) return null
      kept.push(index)
      const q = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity < 100_000 ? item.quantity : null
      return {
        name,
        quantity: q === null ? null : Math.round(q * 1000) / 1000,
        unit: str(item.unit, 30) || null,
        note: str(item.note, 200) || null,
        section: str(item.section, 80) || null,
      }
    })
    .filter((i): i is ImportedIngredient => i !== null)

  if (ingredients.length === 0) throw new ImportError(notFound, 422)

  const servings = typeof data.servings === 'number' && Number.isInteger(data.servings) && data.servings >= 1 && data.servings <= 100 ? data.servings : null
  const steps =
    typeof data.steps === 'string'
      ? data.steps
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000)
      : ''
  const tags = [
    ...new Set(
      (Array.isArray(data.tags) ? data.tags : [])
        .map((t) => str(t, 30).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5)

  // Ingrédients sans sous-partie d'abord, puis chaque sous-partie d'un seul tenant (dans l'ordre d'apparition) :
  // dans le formulaire, un ingrédient appartient au dernier titre de sous-partie qui le précède.
  const sections = [...new Set(ingredients.map((i) => i.section))].sort((a, b) => (a === null ? -1 : b === null ? 1 : 0))
  const order = sections.flatMap((section) => ingredients.flatMap((i, index) => (i.section === section ? [index] : [])))
  const grouped = order.map((index) => ingredients[index]!)

  // Ingrédient désigné par son nom (exact, sinon une seule correspondance partielle), ou -1.
  const byName = (v: unknown) => {
    const key = str(v, 120).toLowerCase()
    if (!key) return -1
    const names = grouped.map((i) => i.name.toLowerCase())
    const exact = names.indexOf(key)
    if (exact >= 0) return exact
    const partial = names.flatMap((name, index) => (name.includes(key) || key.includes(name) ? [index] : []))
    return partial.length === 1 ? partial[0]! : -1
  }
  const checks = (Array.isArray(data.checks) ? data.checks : [])
    .slice(0, 8)
    .flatMap((raw): ImportCheck[] => {
      const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      const message = str(item.message, 160)
      if (!message) return []
      // Le modèle se trompe parfois de numéro : le nom recopié, s'il désigne un ingrédient, fait foi.
      const named = byName(item.ingredient_name)
      const position = named >= 0 ? named : typeof item.ingredient === 'number' ? order.indexOf(kept.indexOf(item.ingredient)) : -1
      return [{ ingredient: position >= 0 ? position : null, message }]
    })

  const minutes = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 10_080 ? v : null)
  const page = str(data.page, 20).replace(/^p(?:age)?\.?\s*/i, '') || null

  return {
    title: str(data.title, 200) || str(fallbackTitle, 200) || 'Recette importée',
    servings,
    ingredients: grouped,
    steps,
    tags,
    checks,
    source: str(data.source, 200) || null,
    page,
    nutrition: sanitizeNutrition(data.nutrition),
    prep_minutes: minutes(data.prep_minutes),
    rest_minutes: minutes(data.rest_minutes),
    cook_minutes: minutes(data.cook_minutes),
  }
}

/** Appelle le modèle et renvoie la recette validée. */
export async function extractRecipe(
  content: PageContent,
  url: string,
  knownTags: readonly string[],
  options: ModelOptions,
): Promise<{ recipe: ImportedRecipe; usage: ModelUsage | null }> {
  const { input, usage } = await callTool(
    {
      system: SYSTEM,
      tool: TOOL,
      message: buildUserMessage(content, url, knownTags),
      maxTokens: 8192,
      timeoutMs: 60_000,
      failure: 'L’analyse de la page a échoué',
      missing: 'réponse sans recette',
    },
    options,
  )
  return { recipe: sanitizeRecipe(input, content.title), usage }
}

// ---------------------------------------------------------------------------
// Photos d'une page de livre ou d'un scan

export interface PhotoInput {
  /** Image en base64 (sans préfixe data:). */
  data: string
  type: 'image/jpeg' | 'image/png' | 'image/webp'
}

const PHOTO_TOOL_NAME = 'enregistrer_recettes'

/** Photo : une page peut contenir plusieurs recettes, chacune avec le même contenu qu'une recette de page web. */
const PHOTO_TOOL = {
  name: PHOTO_TOOL_NAME,
  description: 'Enregistre les recettes lues sur la photo (une le plus souvent).',
  input_schema: {
    type: 'object',
    properties: {
      recettes: {
        type: 'array',
        description: `Une entrée par recette distincte, avec son propre titre (${MAX_PHOTO_RECIPES} au plus) ; liste vide si la photo ne contient pas de recette.`,
        items: TOOL.input_schema,
      },
    },
    required: ['recettes'],
  },
}

const PHOTO_SYSTEM = [
  'Tu lis des recettes de cuisine sur une ou deux photos (page de livre, magazine, fiche ou scan), en français.',
  'Recopie fidèlement ce qui est écrit, sans rien inventer : si un passage est illisible, laisse-le de côté.',
  'Si les photos sont deux pages de la même recette, assemble-les dans l’ordre.',
  'Une page peut contenir plusieurs recettes distinctes, chacune avec son titre : renvoie-les toutes, dans l’ordre de la page.',
  'Les parties d’une même recette (« Pour la pâte », « Pour la garniture ») ne sont pas des recettes à part.',
  'Range chaque ingrédient dans sa sous-partie (section) quand la recette en a (« Pour le streusel »).',
  'Signale dans checks tout ce que tu as deviné ou mal lu.',
  'Note le titre du livre s’il est visible et le numéro de page imprimé, séparément.',
  'Reprends les valeurs nutritionnelles (calories, glucides, protéines, lipides) si la recette les indique, sans les calculer.',
  'Traduis en français si la recette est dans une autre langue.',
  'Pour les tags, réutilise de préférence les tags existants fournis.',
  `Réponds uniquement en appelant l’outil ${PHOTO_TOOL_NAME}.`,
].join('\n')

/** Lit les recettes sur les photos (une le plus souvent) et les renvoie validées, dans l'ordre de la page. */
export async function extractRecipeFromPhotos(
  photos: readonly PhotoInput[],
  knownTags: readonly string[],
  options: ModelOptions,
): Promise<{ recipes: ImportedRecipe[]; usage: ModelUsage | null }> {
  const tags = knownTags.slice(0, MAX_KNOWN_TAGS).join(', ')
  const text = [photos.length > 1 ? 'Deux photos de la recette.' : 'Photo de la recette.', tags ? `Tags existants : ${tags}` : null].filter(Boolean).join('\n')
  const { input, usage } = await callTool(
    {
      system: PHOTO_SYSTEM,
      tool: PHOTO_TOOL,
      message: [...photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.type, data: p.data } })), { type: 'text', text }],
      maxTokens: 8192,
      // Lire deux pages et tout rédiger peut prendre plus longtemps qu'une page web déjà structurée.
      timeoutMs: 90_000,
      failure: 'La lecture de la photo a échoué',
      missing: 'réponse sans recette',
    },
    options,
  )
  return { recipes: sanitizeRecipes(input), usage }
}

const NOT_FOUND_ON_PHOTO = 'Aucune recette lisible sur cette photo. Essaie une photo plus nette, bien droite.'

/** Recettes lues sur une photo : chacune validée ; celles qui ne sont pas des recettes (ou sans ingrédient) sont écartées. */
export function sanitizeRecipes(input: unknown): ImportedRecipe[] {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const recipes = (Array.isArray(data.recettes) ? data.recettes : []).slice(0, MAX_PHOTO_RECIPES).flatMap((raw) => {
    try {
      return [sanitizeRecipe(raw, null, NOT_FOUND_ON_PHOTO)]
    } catch {
      return []
    }
  })
  if (recipes.length === 0) throw new ImportError(NOT_FOUND_ON_PHOTO, 422)
  return recipes
}

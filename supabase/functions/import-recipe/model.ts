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
}

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: ImportedIngredient[]
  steps: string
  tags: string[]
}

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
          },
          required: ['name', 'quantity', 'unit', 'note'],
        },
      },
      steps: { type: 'string', description: 'Étapes de préparation numérotées, une par ligne (« 1. … »), reformulées sans rien inventer.' },
      tags: { type: 'array', items: { type: 'string' }, description: '0 à 5 tags courts en minuscules (ex. végé, rapide, dessert).' },
    },
    required: ['is_recipe', 'title', 'servings', 'ingredients', 'steps', 'tags'],
  },
}

const SYSTEM = [
  'Tu extrais une recette de cuisine à partir du contenu d’une page web, en français.',
  'N’invente rien : si une information manque, laisse-la vide ou null.',
  'Traduis en français si la page est dans une autre langue.',
  'Pour les tags, réutilise de préférence les tags existants fournis.',
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

/** Ne garde que des valeurs sûres et bornées, quel que soit ce que renvoie le modèle. */
export function sanitizeRecipe(input: unknown, fallbackTitle: string | null): ImportedRecipe {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  if (data.is_recipe === false) throw new ImportError('Aucune recette trouvée sur cette page.', 422)

  const ingredients = (Array.isArray(data.ingredients) ? data.ingredients : [])
    .slice(0, 60)
    .map((raw): ImportedIngredient | null => {
      const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      const name = str(item.name, 120)
      if (!name) return null
      const q = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity < 100_000 ? item.quantity : null
      return { name, quantity: q === null ? null : Math.round(q * 1000) / 1000, unit: str(item.unit, 30) || null, note: str(item.note, 200) || null }
    })
    .filter((i): i is ImportedIngredient => i !== null)

  if (ingredients.length === 0) throw new ImportError('Aucune recette trouvée sur cette page.', 422)

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

  return { title: str(data.title, 200) || str(fallbackTitle, 200) || 'Recette importée', servings, ingredients, steps, tags }
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
      maxTokens: 4096,
      failure: 'L’analyse de la page a échoué',
      missing: 'réponse sans recette',
    },
    options,
  )
  return { recipe: sanitizeRecipe(input, content.title), usage }
}

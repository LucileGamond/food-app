// Appel au modèle (API Messages d'Anthropic) pour transformer le contenu nettoyé en recette structurée.

import type { PageContent } from './extract.ts'

export const DEFAULT_MODEL = 'claude-haiku-5-5'
const API_URL = 'https://api.anthropic.com/v1/messages'
const TIMEOUT_MS = 45_000
const MAX_KNOWN_TAGS = 40

export interface ImportedIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

export interface ImportedRecipe {
  title: string
  servings: number | null
  ingredients: ImportedIngredient[]
  steps: string
  tags: string[]
}

export interface ModelUsage {
  input_tokens: number
  output_tokens: number
}

export class ImportError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ImportError'
    this.status = status
  }
}

const TOOL_NAME = 'enregistrer_recette'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre la recette extraite de la page.',
  input_schema: {
    type: 'object',
    properties: {
      is_recipe: { type: 'boolean', description: 'false si la page ne contient pas de recette de cuisine.' },
      title: { type: 'string', description: 'Nom de la recette, sans le nom du site.' },
      servings: { type: ['integer', 'null'], description: 'Nombre de portions / personnes, null si inconnu.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingrédient seul, en minuscules, sans la quantité (ex. « farine », « œufs »).' },
            quantity: { type: ['number', 'null'], description: 'Quantité numérique (½ → 0.5, « un » → 1), null si non précisée.' },
            unit: {
              type: ['string', 'null'],
              description: 'Unité courte : g, kg, ml, cl, l, c. à s., c. à c., pincée, gousse, tranche, sachet… ; null pour un nombre de pièces.',
            },
          },
          required: ['name', 'quantity', 'unit'],
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
      return { name, quantity: q === null ? null : Math.round(q * 1000) / 1000, unit: str(item.unit, 20) || null }
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

export interface ModelOptions {
  apiKey: string
  model?: string
  fetch?: typeof fetch
}

/** Appelle le modèle et renvoie la recette validée. */
export async function extractRecipe(
  content: PageContent,
  url: string,
  knownTags: readonly string[],
  { apiKey, model = DEFAULT_MODEL, fetch: doFetch = fetch }: ModelOptions,
): Promise<{ recipe: ImportedRecipe; usage: ModelUsage | null }> {
  let response: Response
  try {
    response = await doFetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL_NAME },
        messages: [{ role: 'user', content: buildUserMessage(content, url, knownTags) }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ImportError('Le service d’analyse ne répond pas. Réessaie dans un instant.', 503)
  }

  if (response.status === 401 || response.status === 403) throw new ImportError('Le service d’analyse est mal configuré.', 500)
  if (response.status === 429 || response.status === 529 || response.status >= 500) {
    throw new ImportError('Le service d’analyse est surchargé. Réessaie dans un instant.', 503)
  }
  if (!response.ok) throw new ImportError('L’analyse de la page a échoué.', 502)

  const body = (await response.json()) as { content?: { type: string; name?: string; input?: unknown }[]; usage?: ModelUsage }
  const call = body.content?.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME)
  if (!call) throw new ImportError('L’analyse de la page a échoué.', 502)
  return { recipe: sanitizeRecipe(call.input, content.title), usage: body.usage ?? null }
}

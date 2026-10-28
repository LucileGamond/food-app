// Idées de repas pour les prochains jours : recettes enregistrées et recettes trouvées sur internet (recherche web
// côté Anthropic). Indépendant de Deno pour pouvoir être testé.

import { HttpError, runConversation, type ContentBlock, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'

export const MAX_CANDIDATES = 80
export const MAX_RECENT = 40
/** Au-delà, la fonction Supabase serait coupée (150 s) : mieux vaut une erreur claire. */
const TIMEOUT_MS = 100_000
const MIN_IDEAS = 3
/** Proposés par le modèle, parmi lesquels le code choisit les plus variés. */
const MAX_IDEAS = 8
/** Idées montrées. */
export const SHOWN_IDEAS = 5
const VEGETARIAN_MIN = 2
const VEGETARIAN_MAX = 3

export interface Candidate {
  id: string
  title: string
  ingredients: string[]
  tags: string[]
}

export interface SuggestInput {
  today: string
  candidates: Candidate[]
  recent: string[]
}

interface IdeaBase {
  title: string
  protein: string
  vegetables: string[]
  starch: string
  vegetarian: boolean
  why: string
}

export type Idea = IdeaBase & ({ source: 'saved'; recipeId: string } | { source: 'web'; url: string; site: string })

const TOOL_NAME = 'proposer_repas'

const TOOL = {
  name: TOOL_NAME,
  description: 'Propose les idées de repas retenues.',
  input_schema: {
    type: 'object',
    properties: {
      idees: {
        type: 'array',
        description: '8 plats complets et variés.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['saved', 'web'], description: 'saved : recette enregistrée ; web : recette trouvée par la recherche.' },
            recipe_id: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Pour saved : id de la recette enregistrée, recopié exactement.' },
            title: { type: 'string', description: 'Nom du plat.' },
            url: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Pour web : adresse exacte de la page de recette, prise dans les résultats de recherche.' },
            site: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Pour web : nom du site (ex. Marmiton).' },
            protein: { type: 'string', description: 'Protéine principale (poulet, lentilles, œufs…).' },
            vegetables: { type: 'array', items: { type: 'string' }, description: 'Légumes principaux (1 à 3).' },
            starch: { type: 'string', description: 'Féculent (riz, pâtes, pommes de terre…).' },
            vegetarian: { type: 'boolean', description: 'Vrai si le plat ne contient ni viande ni poisson.' },
            why: { type: 'string', description: 'Une phrase courte : pourquoi ce plat (saison, rapidité…).' },
          },
          required: ['source', 'recipe_id', 'title', 'url', 'site', 'protein', 'vegetables', 'starch', 'vegetarian', 'why'],
        },
      },
    },
    required: ['idees'],
  },
}

const SEASONS = ['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'été', 'été', 'été', 'automne', 'automne', 'automne', 'hiver']

const SYSTEM = [
  'Tu proposes des idées de repas (déjeuner ou dîner) à une famille française pour les prochains jours.',
  'Propose 8 plats. Chaque plat est complet : une protéine (animale ou végétale), des légumes et un féculent.',
  'Au moins 3 plats sont végétariens (protéine végétale, œufs ou fromage ; ni viande ni poisson).',
  'Les plats doivent être très différents : chaque plat a sa propre protéine, et aucun légume ni féculent ne revient d’un plat à l’autre (pas deux plats à la courge, au riz ou aux pois chiches).',
  'Privilégie les légumes de saison, sans t’y limiter.',
  'Évite les plats proches de ceux mangés ou prévus récemment.',
  'Prends les recettes enregistrées qui conviennent, et complète avec des recettes trouvées par la recherche web sur des sites de recettes en français.',
  'N’invente jamais de recette ni d’adresse : une recette web doit venir d’un résultat de recherche, avec son adresse exacte.',
  `N’écris pas de texte : après tes recherches, appelle directement l’outil ${TOOL_NAME}.`,
].join('\n')

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const list = (v: unknown, count: number, max: number): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean))].slice(0, count)

/** Entrée reçue du navigateur : validée et bornée. */
export function parseInput(body: unknown): SuggestInput {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const today = str(data.today, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) throw new HttpError('Date invalide.', 400)
  const rawCandidates = Array.isArray(data.candidates) ? data.candidates : []
  if (rawCandidates.length > MAX_CANDIDATES) throw new HttpError(`${MAX_CANDIDATES} recettes au plus.`, 400)
  const candidates: Candidate[] = []
  for (const value of rawCandidates) {
    const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const id = str(raw.id, 64)
    const title = str(raw.title, 200)
    if (!id || !title) throw new HttpError('Recette invalide.', 400)
    if (candidates.some((c) => c.id === id)) continue
    candidates.push({ id, title, ingredients: list(raw.ingredients, 15, 80), tags: list(raw.tags, 5, 30) })
  }
  const rawRecent = Array.isArray(data.recent) ? data.recent : []
  if (rawRecent.length > MAX_RECENT) throw new HttpError(`${MAX_RECENT} repas récents au plus.`, 400)
  return { today, candidates, recent: list(rawRecent, MAX_RECENT, 200) }
}

/** Message envoyé au modèle : saison, recettes enregistrées disponibles, plats récents à éviter. */
export function buildUserMessage({ today, candidates, recent }: SuggestInput): string {
  const season = SEASONS[Number(today.slice(5, 7)) - 1]
  const saved = candidates.length
    ? candidates.map((c) => [c.id, c.title, c.ingredients.join(', '), c.tags.join(', ')].join(' | ')).join('\n')
    : '(aucune)'
  return [
    `Date : ${today} (${season})`,
    '',
    'Recettes enregistrées disponibles (id | titre | ingrédients | tags) :',
    saved,
    '',
    `Plats mangés ou prévus récemment, à éviter : ${recent.length ? recent.join(' ; ') : '(aucun)'}`,
  ].join('\n')
}

/** Adresse comparable : sans www, sans paramètres ni ancre, sans / final. */
function urlKey(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return null
  }
}

/** Adresses réellement renvoyées par la recherche web (les seules acceptées pour une recette web). */
export function searchResultUrls(blocks: readonly ContentBlock[]): Map<string, { url: string; title: string }> {
  const results = new Map<string, { url: string; title: string }>()
  for (const block of blocks) {
    // En cas d'erreur de recherche, `content` est un objet (code d'erreur), pas une liste.
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const result of block.content as Record<string, unknown>[]) {
      const url = typeof result?.url === 'string' ? result.url : ''
      const key = urlKey(url)
      if (key && !results.has(key)) results.set(key, { url, title: str(result.title, 200) })
    }
  }
  return results
}

/** Dernière demande après une réponse coupée : les résultats déjà trouvés, à utiliser sans chercher à nouveau. */
export function retryWithResults(blocks: readonly ContentBlock[]): string {
  const results = [...searchResultUrls(blocks).values()].slice(0, 30)
  if (results.length === 0) return 'Aucun résultat de recherche disponible : propose des recettes enregistrées.'
  const lines = results.map((r) => `${r.title} | ${r.url}`).join('\n')
  return `Résultats de recherche déjà trouvés (titre | adresse), à utiliser sans nouvelle recherche :\n${lines}`
}

/**
 * Ne garde que des idées sûres : recette enregistrée connue (titre repris de la recette), ou adresse présente dans les
 * résultats de recherche ; sans doublon ; textes bornés.
 */
export function sanitizeIdeas(output: unknown, input: SuggestInput, blocks: readonly ContentBlock[]): Idea[] {
  const data = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const found = searchResultUrls(blocks)
  const ideas: Idea[] = []
  const seen = new Set<string>()
  for (const value of Array.isArray(data.idees) ? data.idees : []) {
    if (ideas.length >= MAX_IDEAS) break
    const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const base: Omit<IdeaBase, 'title'> = {
      protein: str(raw.protein, 60),
      vegetables: list(raw.vegetables, 3, 60),
      starch: str(raw.starch, 60),
      vegetarian: raw.vegetarian === true,
      why: str(raw.why, 160),
    }
    if (raw.source === 'saved') {
      const recipe = input.candidates.find((c) => c.id === str(raw.recipe_id, 64))
      if (!recipe || seen.has(`saved:${recipe.id}`)) continue
      seen.add(`saved:${recipe.id}`)
      ideas.push({ ...base, source: 'saved', recipeId: recipe.id, title: recipe.title })
    } else if (raw.source === 'web') {
      const key = urlKey(str(raw.url, 2000))
      const result = key ? found.get(key) : undefined
      if (!key || !result || seen.has(`web:${key}`)) continue
      seen.add(`web:${key}`)
      const title = str(raw.title, 200) || result.title
      if (!title) continue
      ideas.push({ ...base, source: 'web', url: result.url, site: str(raw.site, 60) || new URL(result.url).hostname.replace(/^www\./, ''), title })
    }
  }
  return ideas
}

// Comparaison des aliments : « Blanc de poulet » et « poulet rôti » partagent le poulet ; « pommes de terre » et
// « pomme de terre nouvelle », la pomme de terre. Les mots qui ne désignent pas l'aliment sont ignorés.
const NOT_FOOD = new Set([
  'aux', 'des', 'les', 'une', 'avec', 'sans', 'facon', 'frais', 'fraiche', 'fraiches', 'sec', 'seche', 'seches',
  'blanc', 'blanche', 'rouge', 'vert', 'verte', 'jaune', 'noir', 'noire', 'petit', 'petite', 'gros', 'grosse',
  'jeune', 'nouveau', 'nouvelle', 'roti', 'rotie', 'grille', 'grillee', 'cuit', 'cuite', 'maison', 'bio',
])

/** Mots significatifs d'un aliment : sans accents ni majuscules, au singulier. */
export function foodWords(name: string): Set<string> {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, '') : w))
    .filter((w) => w.length >= 3 && !NOT_FOOD.has(w))
  return new Set(words)
}

const sameFood = (a: string, b: string) => {
  const words = foodWords(b)
  return [...foodWords(a)].some((w) => words.has(w))
}

/** Ressemblance entre deux plats : même protéine (le plus gênant), même féculent, légumes en commun. */
function overlap(a: Idea, b: Idea): number {
  let score = 0
  if (a.protein && b.protein && sameFood(a.protein, b.protein)) score += 10
  if (a.starch && b.starch && sameFood(a.starch, b.starch)) score += 4
  for (const vegetable of a.vegetables) if (b.vegetables.some((other) => sameFood(vegetable, other))) score += 3
  return score
}

/**
 * Les plats les plus variés (le modèle ne varie pas toujours assez) : choisis un à un, chaque fois celui qui ressemble
 * le moins aux plats déjà retenus, avec 2 ou 3 plats végétariens quand c'est possible. L'ordre du modèle départage les
 * égalités.
 */
export function pickVaried(ideas: readonly Idea[], count = SHOWN_IDEAS): Idea[] {
  const picked: Idea[] = []
  const rest = [...ideas]
  while (picked.length < count && rest.length > 0) {
    const vegetarian = picked.filter((i) => i.vegetarian).length
    const slots = count - picked.length
    const allowed = rest.filter((idea) => {
      if (idea.vegetarian && vegetarian >= VEGETARIAN_MAX) return false
      // Places restantes réservées aux plats végés manquants.
      if (!idea.vegetarian && VEGETARIAN_MIN - vegetarian >= slots) return false
      return true
    })
    const pool = allowed.length > 0 ? allowed : rest
    let best = pool[0]!
    let bestScore = Infinity
    for (const idea of pool) {
      const score = picked.reduce((sum, other) => sum + overlap(idea, other), 0)
      if (score < bestScore) {
        best = idea
        bestScore = score
      }
    }
    picked.push(best)
    rest.splice(rest.indexOf(best), 1)
  }
  // Affichés dans l'ordre du modèle.
  return picked.sort((a, b) => ideas.indexOf(a) - ideas.indexOf(b))
}

export async function suggestMeals(
  input: SuggestInput,
  options: ModelOptions & { webSearchTool?: string },
): Promise<{ ideas: Idea[]; vegetarian: number; searches: number; usage: ModelUsage }> {
  const { input: output, blocks, usage } = await runConversation(
    {
      system: SYSTEM,
      tool: TOOL,
      serverTools: [
        {
          type: options.webSearchTool ?? 'web_search_20250305',
          name: 'web_search',
          max_uses: 4,
          user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' },
        },
      ],
      message: buildUserMessage(input),
      // La réflexion du modèle compte dans cette limite : peu de réflexion, et de la marge (la sortie coûte peu).
      maxTokens: 16_000,
      effort: 'low',
      retryAfterTruncation: retryWithResults,
      failure: 'La recherche d’idées a échoué',
      missing: 'réponse sans idées',
      timeoutMs: TIMEOUT_MS,
    },
    options,
  )
  const valid = sanitizeIdeas(output, input, blocks)
  if (valid.length < MIN_IDEAS) throw new HttpError('Pas assez d’idées trouvées : réessaie.', 502)
  const ideas = pickVaried(valid)
  return {
    ideas,
    vegetarian: ideas.filter((i) => i.vegetarian).length,
    searches: blocks.filter((b) => b.type === 'server_tool_use').length,
    usage,
  }
}

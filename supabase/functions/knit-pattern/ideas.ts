// Idées de modèles pour une laine du stock, quand aucun patron mis de côté ne convient : types d'ouvrages adaptés
// au métrage et à la grosseur, avec de vrais patrons trouvés par une recherche web (seules les adresses réellement
// trouvées sont gardées), des mots-clés et la grosseur de laine (l'application en fait une recherche Ravelry filtrée).

import { HttpError, runConversation, type ContentBlock, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { searchResultUrls } from '../_shared/search.ts'

export interface IdeasInput {
  yarn: string
  meters: number | null
  needleMm: number | null
}

/** Patron trouvé sur internet pour une idée. */
export interface FoundPattern {
  title: string
  url: string
}

export interface YarnIdea {
  title: string
  why: string
  meters: number | null
  needleMm: number | null
  search: string
  patterns: FoundPattern[]
}

/** Grosseurs de laine de Ravelry (filtre « weight » de la recherche de patrons). */
export const RAVELRY_WEIGHTS = ['thread', 'cobweb', 'lace', 'light-fingering', 'fingering', 'sport', 'dk', 'worsted', 'aran', 'bulky', 'super-bulky', 'jumbo'] as const
export type RavelryWeight = (typeof RAVELRY_WEIGHTS)[number]

const MAX_IDEAS = 5
const MAX_PATTERNS = 3
/** Recherche web comprise : jusqu'à 2 minutes. */
const TIMEOUT_MS = 110_000

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positive(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null
}

/** Corps { ideas: { yarn: description, meters, needle_mm } } ; null si ce n'est pas une demande d'idées. */
export function parseIdeasInput(body: unknown): IdeasInput | null {
  const data = asRecord(body)
  if (!('ideas' in data)) return null
  const ideas = asRecord(data.ideas)
  const yarn = text(ideas.yarn, 400)
  if (!yarn) throw new HttpError('Décris la laine.', 400)
  return { yarn, meters: positive(ideas.meters, 100_000), needleMm: positive(ideas.needle_mm, 30) }
}

export const IDEAS_TOOL: Tool = {
  name: 'proposer_modeles',
  description: 'Propose des ouvrages à tricoter avec cette laine.',
  input_schema: {
    type: 'object',
    properties: {
      weight: {
        type: ['string', 'null'],
        enum: [...RAVELRY_WEIGHTS, null],
        description: 'Grosseur de la laine selon les catégories de Ravelry (null si on ne peut pas la déduire).',
      },
      ideas: {
        type: 'array',
        description: `De 3 à ${MAX_IDEAS} ouvrages réalisables avec la quantité disponible, du plus adapté au moins adapté.`,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Ouvrage, en français (« Bonnet à côtes 2/2 », « Snood torsadé »).' },
            why: { type: 'string', description: 'Une phrase : pourquoi il convient à cette laine (quantité, grosseur, matière).' },
            meters: { type: ['integer', 'null'], description: 'Métrage habituel pour un adulte, en mètres.' },
            needle_mm: { type: ['number', 'null'], description: 'Aiguilles conseillées en mm.' },
            search: { type: 'string', description: 'Mots-clés en anglais pour chercher un patron (« ribbed beanie »), sans la grosseur.' },
            patterns: {
              type: 'array',
              description: `Jusqu’à ${MAX_PATTERNS} vrais patrons trouvés par la recherche web pour cet ouvrage, avec l’adresse exacte de leur page.`,
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Nom du patron (et de sa créatrice si connue).' },
                  url: { type: 'string', description: 'Adresse exacte de la page du patron, telle que trouvée par la recherche.' },
                },
                required: ['title', 'url'],
              },
            },
          },
          required: ['title', 'why', 'meters', 'needle_mm', 'search', 'patterns'],
        },
      },
    },
    required: ['weight', 'ideas'],
  },
}

const SYSTEM = [
  'Tu conseilles une tricoteuse qui veut utiliser une laine de son stock.',
  'Propose des ouvrages réalistes avec le métrage disponible (sans dépasser la quantité), adaptés à la grosseur et à la matière.',
  'Cherche sur internet de vrais patrons de tricot pour ces ouvrages, adaptés à cette grosseur de laine et à ces aiguilles',
  '(Ravelry, sites de créatrices, DROPS, LoveCrafts…), en français ou en anglais ; deux ou trois recherches suffisent.',
  'Pour chaque ouvrage, donne jusqu’à 3 patrons trouvés avec l’adresse exacte de leur page : n’invente jamais d’adresse.',
  'Donne aussi la grosseur de la laine selon les catégories de Ravelry, et des mots-clés en anglais pour chaque ouvrage.',
].join('\n')

/** Adresse comparable, paramètres compris (« pattern.php?id=123 » : un patron par identifiant). */
function patternKey(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase()
  } catch {
    return null
  }
}

/** Pages réellement renvoyées par la recherche web, par adresse complète. */
function foundPages(blocks: readonly ContentBlock[]): Map<string, { url: string; title: string }> {
  const pages = new Map<string, { url: string; title: string }>()
  for (const block of blocks) {
    // En cas d'erreur de recherche, `content` est un objet (code d'erreur), pas une liste.
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const result of block.content as Record<string, unknown>[]) {
      const url = typeof result?.url === 'string' ? result.url : ''
      const key = patternKey(url)
      if (key && !pages.has(key)) pages.set(key, { url, title: text(result.title, 150) })
    }
  }
  return pages
}

/**
 * Idées valides, bornées ; seuls les patrons dont l'adresse a vraiment été trouvée par la recherche web sont gardés
 * (une fois chacun).
 */
export function sanitizeIdeas(input: unknown, blocks: readonly ContentBlock[] = []): { ideas: YarnIdea[]; weight: RavelryWeight | null } {
  const data = asRecord(input)
  const found = foundPages(blocks)
  const seen = new Set<string>()
  const ideas = (Array.isArray(data.ideas) ? data.ideas : [])
    .map((value) => {
      const i = asRecord(value)
      const meters = positive(i.meters, 100_000)
      const patterns = (Array.isArray(i.patterns) ? i.patterns : []).flatMap((p): FoundPattern[] => {
        const pattern = asRecord(p)
        const key = patternKey(text(pattern.url, 2000))
        const result = key ? found.get(key) : undefined
        if (!key || !result || seen.has(key)) return []
        seen.add(key)
        return [{ title: text(pattern.title, 150) || result.title || result.url, url: result.url }]
      })
      return {
        title: text(i.title, 120),
        why: text(i.why, 300),
        meters: meters === null ? null : Math.round(meters),
        needleMm: positive(i.needle_mm, 30),
        search: text(i.search, 100),
        patterns: patterns.slice(0, MAX_PATTERNS),
      }
    })
    .filter((i) => i.title)
    .slice(0, MAX_IDEAS)
  if (ideas.length === 0) throw new HttpError('Aucune idée trouvée pour cette laine.', 422)
  const weight = RAVELRY_WEIGHTS.find((w) => w === data.weight) ?? null
  return { ideas, weight }
}

/** Réponse coupée : nouvelle demande, outil imposé, avec les pages déjà trouvées (pas de nouvelle recherche). */
function retryWithResults(blocks: readonly ContentBlock[]): string {
  const results = [...searchResultUrls(blocks).values()].slice(0, 30)
  if (results.length === 0) return 'Réponds sans chercher, avec des listes de patrons vides.'
  return ['Ne cherche plus : choisis les patrons parmi ces pages déjà trouvées.', ...results.map((r) => `- ${r.title} : ${r.url}`)].join('\n')
}

export async function suggestIdeas(
  input: IdeasInput,
  options: ModelOptions & { webSearchTool?: string },
): Promise<{ ideas: YarnIdea[]; weight: RavelryWeight | null; searches: number; usage: ModelUsage | null }> {
  const details = [
    `Laine : ${input.yarn}`,
    input.meters !== null ? `Quantité disponible : ${input.meters} m` : 'Quantité disponible : inconnue',
    input.needleMm !== null ? `Aiguilles conseillées : ${input.needleMm} mm` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const { input: raw, blocks, usage } = await runConversation(
    {
      system: SYSTEM,
      tool: IDEAS_TOOL,
      serverTools: [{ type: options.webSearchTool ?? 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      message: [{ type: 'text', text: details }],
      // La réflexion du modèle compte dans cette limite : peu de réflexion, et de la marge.
      maxTokens: 8_000,
      effort: 'low',
      retryAfterTruncation: retryWithResults,
      failure: 'La recherche d’idées a échoué',
      missing: 'réponse sans idées',
      timeoutMs: TIMEOUT_MS,
    },
    options,
  )
  return { ...sanitizeIdeas(raw, blocks), searches: blocks.filter((b) => b.type === 'server_tool_use').length, usage }
}

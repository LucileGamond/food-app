// Idées de modèles pour une ou plusieurs laines du stock : types d'ouvrages adaptés au métrage et à la grosseur
// (combinant les laines s'il y en a plusieurs), selon l'envie de la tricoteuse.
//
// Deux temps, pour limiter le coût :
//   - { ideas } sans recherche web (search: false) : idées seules, quelques dixièmes de centime ;
//   - { idea_patterns } : vrais patrons trouvés par une recherche web pour UNE idée choisie (2 recherches au plus).
// { ideas } avec search: true fait les deux d'un coup (4 recherches au plus). Seules les adresses réellement trouvées
// par la recherche sont gardées ; des mots-clés et la grosseur de laine donnent une recherche Ravelry filtrée.

import { callTool, HttpError, runConversation, type ContentBlock, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { searchResultUrls } from '../_shared/search.ts'

/** Une laine du stock : description, métrage disponible, aiguilles conseillées. */
export interface IdeaYarn {
  yarn: string
  meters: number | null
  needleMm: number | null
}

export interface IdeasInput {
  yarns: IdeaYarn[]
  /** Envie de la tricoteuse (« un pull », « pour bébé »), ou ''. */
  wish: string
  /** Chercher aussi de vrais patrons sur internet (plus cher). */
  search: boolean
}

/** Patron trouvé sur internet pour une idée. */
export interface FoundPattern {
  title: string
  url: string
  /** Gratuit, payant, ou inconnu. */
  free: boolean | null
  /** Langue du patron (« fr », « en »), si connue. */
  language: string | null
  /** Métrage demandé (plus petite taille), et jusqu'à combien (plus grande taille) : connus pour Ravelry. */
  meters: number | null
  metersMax: number | null
}

export interface YarnIdea {
  title: string
  why: string
  /** Pour qui ou quelle taille (« adulte », « enfant 4 ans », « taille unique »). */
  size: string
  meters: number | null
  needleMm: number | null
  search: string
  patterns: FoundPattern[]
}

/** Idée pour laquelle chercher des patrons (demande { idea_patterns }). */
export interface IdeaPatternsInput {
  idea: { title: string; search: string; size: string; meters: number | null; needleMm: number | null }
  yarns: IdeaYarn[]
  weight: RavelryWeight | null
}

/** Grosseurs de laine de Ravelry (filtre « weight » de la recherche de patrons). */
export const RAVELRY_WEIGHTS = ['thread', 'cobweb', 'lace', 'light-fingering', 'fingering', 'sport', 'dk', 'worsted', 'aran', 'bulky', 'super-bulky', 'jumbo'] as const
export type RavelryWeight = (typeof RAVELRY_WEIGHTS)[number]

export const MAX_IDEA_YARNS = 4
export const MAX_WISH = 120
const MAX_IDEAS = 5
const MAX_PATTERNS = 3
/** Recherche web comprise : jusqu'à 2 minutes. */
const TIMEOUT_MS = 110_000
const NO_SEARCH_TIMEOUT_MS = 45_000

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positive(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null
}

function parseYarn(value: unknown): IdeaYarn | null {
  const y = asRecord(value)
  const yarn = text(y.yarn, 400)
  return yarn ? { yarn, meters: positive(y.meters, 100_000), needleMm: positive(y.needle_mm, 30) } : null
}

/** { yarns: [{ yarn, meters, needle_mm }] } ou, comme avant, { yarn, meters, needle_mm } : laines décrites. */
function parseYarns(data: Record<string, unknown>): IdeaYarn[] {
  const list = Array.isArray(data.yarns) ? data.yarns : [data]
  if (list.length > MAX_IDEA_YARNS) throw new HttpError(`${MAX_IDEA_YARNS} laines au plus.`, 400)
  const yarns = list.map(parseYarn)
  if (yarns.length === 0 || yarns.some((y) => y === null)) throw new HttpError('Décris la laine.', 400)
  return yarns as IdeaYarn[]
}

/** Corps { ideas: { yarns, wish, search } } ; null si ce n'est pas une demande d'idées. */
export function parseIdeasInput(body: unknown): IdeasInput | null {
  const data = asRecord(body)
  if (!('ideas' in data)) return null
  const ideas = asRecord(data.ideas)
  // Sans précision : avec recherche web, comme avant le mode sans recherche.
  return { yarns: parseYarns(ideas), wish: text(ideas.wish, MAX_WISH), search: ideas.search !== false }
}

/** Corps { idea_patterns: { idea: { title, search, size, meters, needle_mm }, yarns, weight } } ; null sinon. */
export function parseIdeaPatternsInput(body: unknown): IdeaPatternsInput | null {
  const data = asRecord(body)
  if (!('idea_patterns' in data)) return null
  const request = asRecord(data.idea_patterns)
  const idea = asRecord(request.idea)
  const title = text(idea.title, 120)
  if (!title) throw new HttpError('Choisis une idée.', 400)
  return {
    idea: { title, search: text(idea.search, 100), size: text(idea.size, 40), meters: positive(idea.meters, 100_000), needleMm: positive(idea.needle_mm, 30) },
    yarns: parseYarns(request),
    weight: RAVELRY_WEIGHTS.find((w) => w === request.weight) ?? null,
  }
}

const PATTERN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Nom du patron (et de sa créatrice si connue).' },
    url: { type: 'string', description: 'Adresse exacte de la page du patron, telle que trouvée par la recherche.' },
    free: { type: ['boolean', 'null'], description: 'Patron gratuit (true), payant (false), inconnu (null).' },
    language: { type: ['string', 'null'], description: 'Langue du patron, code à deux lettres (« fr », « en »), null si inconnue.' },
  },
  required: ['title', 'url', 'free', 'language'],
}

const IDEA_PROPERTIES = {
  title: { type: 'string', description: 'Ouvrage, en français (« Bonnet à côtes 2/2 », « Snood torsadé »).' },
  why: {
    type: 'string',
    description: 'Une phrase : pourquoi il convient (quantité, grosseur, matière) ; avec plusieurs laines, comment les associer (rayures, fil doublé, couleurs en blocs…).',
  },
  size: { type: 'string', description: 'Pour qui, quelle taille : « adulte », « femme M », « enfant 4 ans », « bébé 6 mois », « taille unique ».' },
  meters: { type: ['integer', 'null'], description: 'Métrage total nécessaire pour cette taille, en mètres.' },
  needle_mm: { type: ['number', 'null'], description: 'Aiguilles conseillées en mm.' },
  search: { type: 'string', description: 'Mots-clés en anglais pour chercher un patron (« ribbed beanie »), sans la grosseur.' },
}

function ideasTool(withPatterns: boolean): Tool {
  return {
    name: 'proposer_modeles',
    description: 'Propose des ouvrages à tricoter avec ces laines.',
    input_schema: {
      type: 'object',
      properties: {
        weight: {
          type: ['string', 'null'],
          enum: [...RAVELRY_WEIGHTS, null],
          description: 'Grosseur de la laine (de la première s’il y en a plusieurs) selon les catégories de Ravelry (null si on ne peut pas la déduire).',
        },
        ideas: {
          type: 'array',
          description: `De 3 à ${MAX_IDEAS} ouvrages réalisables avec la quantité disponible, du plus adapté au moins adapté.`,
          items: {
            type: 'object',
            properties: withPatterns
              ? {
                  ...IDEA_PROPERTIES,
                  patterns: {
                    type: 'array',
                    description: `Jusqu’à ${MAX_PATTERNS} vrais patrons trouvés par la recherche web pour cet ouvrage, avec l’adresse exacte de leur page.`,
                    items: PATTERN_SCHEMA,
                  },
                }
              : IDEA_PROPERTIES,
            required: [...Object.keys(IDEA_PROPERTIES), ...(withPatterns ? ['patterns'] : [])],
          },
        },
      },
      required: ['weight', 'ideas'],
    },
  }
}

export const IDEAS_TOOL = ideasTool(true)
export const IDEAS_NO_SEARCH_TOOL = ideasTool(false)

export const PATTERNS_TOOL: Tool = {
  name: 'donner_patrons',
  description: 'Donne les vrais patrons trouvés pour cet ouvrage.',
  input_schema: {
    type: 'object',
    properties: { patterns: { type: 'array', description: `Jusqu’à ${MAX_PATTERNS} patrons, du plus adapté au moins adapté.`, items: PATTERN_SCHEMA } },
    required: ['patterns'],
  },
}

const ADVICE = [
  'Tu conseilles une tricoteuse qui veut utiliser des laines de son stock.',
  'Propose des ouvrages réalistes avec le métrage disponible (sans dépasser la quantité de chaque laine, en gardant une petite marge),',
  'adaptés à la grosseur et à la matière ; le métrage indiqué est celui de la taille proposée.',
  'Avec plusieurs laines, chaque ouvrage associe au moins deux d’entre elles (rayures, jacquard, couleurs en blocs, fil doublé…),',
  'et la phrase « pourquoi » dit comment.',
  'Tiens compte des couleurs quand elles sont données (coloris, teintes) : associations qui vont bien ensemble, motifs qui',
  'les mettent en valeur (une laine chinée ou multicolore cache les torsades et les points texturés).',
  'Si elle dit ce dont elle a envie, respecte-le.',
]
const SEARCH_RULES = [
  'Cherche sur internet de vrais patrons de tricot, adaptés à cette grosseur de laine et à ces aiguilles',
  '(Ravelry, sites de créatrices, DROPS, LoveCrafts…) : de préférence gratuits, et en français, sinon en anglais.',
  'Donne l’adresse exacte de la page de chaque patron : n’invente jamais d’adresse. Indique s’il est gratuit et sa langue.',
]

const SYSTEM_SEARCH = [...ADVICE, ...SEARCH_RULES, 'Deux ou trois recherches suffisent ; jusqu’à 3 patrons par ouvrage.', 'Donne aussi la grosseur de la laine selon Ravelry, et des mots-clés en anglais pour chaque ouvrage.'].join('\n')
const SYSTEM_NO_SEARCH = [...ADVICE, 'Donne aussi la grosseur de la laine selon Ravelry, et des mots-clés en anglais pour chaque ouvrage.'].join('\n')
const SYSTEM_PATTERNS = ['Tu aides une tricoteuse à trouver un patron pour un ouvrage choisi.', ...SEARCH_RULES, 'Une ou deux recherches suffisent ; jusqu’à 3 patrons.'].join('\n')

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

function language(value: unknown): string | null {
  const code = text(value, 5).toLowerCase()
  return /^[a-z]{2}$/.test(code) ? code : null
}

/** Patrons dont l'adresse a vraiment été trouvée, une fois chacun (`seen` partagé entre les idées). */
function keepFound(list: unknown, found: Map<string, { url: string; title: string }>, seen: Set<string>): FoundPattern[] {
  return (Array.isArray(list) ? list : [])
    .flatMap((p): FoundPattern[] => {
      const pattern = asRecord(p)
      const key = patternKey(text(pattern.url, 2000))
      const result = key ? found.get(key) : undefined
      if (!key || !result || seen.has(key)) return []
      seen.add(key)
      return [
        {
          title: text(pattern.title, 150) || result.title || result.url,
          url: result.url,
          free: typeof pattern.free === 'boolean' ? pattern.free : null,
          language: language(pattern.language),
          meters: null,
          metersMax: null,
        },
      ]
    })
    .slice(0, MAX_PATTERNS)
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
      return {
        title: text(i.title, 120),
        why: text(i.why, 300),
        size: text(i.size, 40),
        meters: meters === null ? null : Math.round(meters),
        needleMm: positive(i.needle_mm, 30),
        search: text(i.search, 100),
        patterns: keepFound(i.patterns, found, seen),
      }
    })
    .filter((i) => i.title)
    .slice(0, MAX_IDEAS)
  if (ideas.length === 0) throw new HttpError('Aucune idée trouvée pour cette laine.', 422)
  const weight = RAVELRY_WEIGHTS.find((w) => w === data.weight) ?? null
  return { ideas, weight }
}

/** Patrons trouvés pour une idée (adresses vérifiées) ; liste vide possible. */
export function sanitizePatterns(input: unknown, blocks: readonly ContentBlock[] = []): FoundPattern[] {
  return keepFound(asRecord(input).patterns, foundPages(blocks), new Set())
}

/** Réponse coupée : nouvelle demande, outil imposé, avec les pages déjà trouvées (pas de nouvelle recherche). */
function retryWithResults(blocks: readonly ContentBlock[]): string {
  const results = [...searchResultUrls(blocks).values()].slice(0, 30)
  if (results.length === 0) return 'Réponds sans chercher, avec des listes de patrons vides.'
  return ['Ne cherche plus : choisis les patrons parmi ces pages déjà trouvées.', ...results.map((r) => `- ${r.title} : ${r.url}`)].join('\n')
}

/** Laines et envie, telles que lues par le modèle. */
export function describeRequest(yarns: readonly IdeaYarn[], wish = ''): string {
  const lines = yarns.flatMap((y, index) => [
    `${yarns.length > 1 ? `Laine ${index + 1}` : 'Laine'} : ${y.yarn}`,
    y.meters !== null ? `Quantité disponible : ${y.meters} m` : 'Quantité disponible : inconnue',
    ...(y.needleMm !== null ? [`Aiguilles conseillées : ${y.needleMm} mm`] : []),
  ])
  if (wish) lines.push(`Envie : ${wish}`)
  return lines.join('\n')
}

function searches(blocks: readonly ContentBlock[]): number {
  return blocks.filter((b) => b.type === 'server_tool_use').length
}

export async function suggestIdeas(
  input: IdeasInput,
  options: ModelOptions & { webSearchTool?: string },
): Promise<{ ideas: YarnIdea[]; weight: RavelryWeight | null; searches: number; usage: ModelUsage | null }> {
  const details = describeRequest(input.yarns, input.wish)
  if (!input.search) {
    const { input: raw, usage } = await callTool(
      {
        system: SYSTEM_NO_SEARCH,
        tool: IDEAS_NO_SEARCH_TOOL,
        message: [{ type: 'text', text: details }],
        maxTokens: 2_000,
        failure: 'La recherche d’idées a échoué',
        missing: 'réponse sans idées',
        timeoutMs: NO_SEARCH_TIMEOUT_MS,
      },
      options,
    )
    return { ...sanitizeIdeas(raw), searches: 0, usage }
  }
  const { input: raw, blocks, usage } = await runConversation(
    {
      system: SYSTEM_SEARCH,
      tool: IDEAS_TOOL,
      serverTools: [{ type: options.webSearchTool ?? 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      // Texte : repris tel quel si la réponse est coupée (sinon la nouvelle demande perdrait la description).
      message: details,
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
  return { ...sanitizeIdeas(raw, blocks), searches: searches(blocks), usage }
}

/** Vrais patrons pour une idée choisie : 2 recherches web au plus. */
export async function findIdeaPatterns(
  input: IdeaPatternsInput,
  options: ModelOptions & { webSearchTool?: string },
): Promise<{ patterns: FoundPattern[]; searches: number; usage: ModelUsage | null }> {
  const { idea } = input
  const details = [
    `Ouvrage : ${idea.title}${idea.size ? ` (${idea.size})` : ''}`,
    idea.search ? `Mots-clés : ${idea.search}` : null,
    input.weight ? `Grosseur (Ravelry) : ${input.weight}` : null,
    idea.meters !== null ? `Métrage nécessaire : ${idea.meters} m` : null,
    idea.needleMm !== null ? `Aiguilles : ${idea.needleMm} mm` : null,
    describeRequest(input.yarns),
  ]
    .filter(Boolean)
    .join('\n')
  const { input: raw, blocks, usage } = await runConversation(
    {
      system: SYSTEM_PATTERNS,
      tool: PATTERNS_TOOL,
      serverTools: [{ type: options.webSearchTool ?? 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      message: details,
      maxTokens: 4_000,
      effort: 'low',
      retryAfterTruncation: retryWithResults,
      failure: 'La recherche de patrons a échoué',
      missing: 'réponse sans patrons',
      timeoutMs: TIMEOUT_MS,
    },
    options,
  )
  return { patterns: sanitizePatterns(raw, blocks), searches: searches(blocks), usage }
}

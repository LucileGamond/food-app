// Idées de modèles pour une laine du stock, quand aucun patron mis de côté ne convient : types d'ouvrages adaptés
// au métrage et à la grosseur, avec des mots-clés de recherche (l'application en fait un lien de recherche).

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

export interface IdeasInput {
  yarn: string
  meters: number | null
  needleMm: number | null
}

export interface YarnIdea {
  title: string
  why: string
  meters: number | null
  needleMm: number | null
  search: string
}

const MAX_IDEAS = 5

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
            search: { type: 'string', description: 'Mots-clés en anglais pour chercher un patron (« ribbed beanie worsted »).' },
          },
          required: ['title', 'why', 'meters', 'needle_mm', 'search'],
        },
      },
    },
    required: ['ideas'],
  },
}

const SYSTEM = [
  'Tu conseilles une tricoteuse qui veut utiliser une laine de son stock.',
  'Propose des ouvrages réalistes avec le métrage disponible (sans dépasser la quantité), adaptés à la grosseur et à la matière.',
  'Ne cite pas de patron précis ni de créatrice : seulement des types d’ouvrages, avec des mots-clés de recherche en anglais.',
].join('\n')

export function sanitizeIdeas(input: unknown): YarnIdea[] {
  const data = asRecord(input)
  const ideas = (Array.isArray(data.ideas) ? data.ideas : [])
    .map((value) => {
      const i = asRecord(value)
      const meters = positive(i.meters, 100_000)
      return {
        title: text(i.title, 120),
        why: text(i.why, 300),
        meters: meters === null ? null : Math.round(meters),
        needleMm: positive(i.needle_mm, 30),
        search: text(i.search, 100),
      }
    })
    .filter((i) => i.title)
    .slice(0, MAX_IDEAS)
  if (ideas.length === 0) throw new HttpError('Aucune idée trouvée pour cette laine.', 422)
  return ideas
}

export async function suggestIdeas(input: IdeasInput, options: ModelOptions): Promise<{ ideas: YarnIdea[]; usage: ModelUsage | null }> {
  const details = [
    `Laine : ${input.yarn}`,
    input.meters !== null ? `Quantité disponible : ${input.meters} m` : 'Quantité disponible : inconnue',
    input.needleMm !== null ? `Aiguilles conseillées : ${input.needleMm} mm` : null,
  ]
    .filter(Boolean)
    .join('\n')
  const { input: raw, usage } = await callTool(
    {
      system: SYSTEM,
      tool: IDEAS_TOOL,
      message: [{ type: 'text', text: details }],
      maxTokens: 1_500,
      failure: 'La recherche d’idées a échoué',
      missing: 'réponse sans idées',
      timeoutMs: 45_000,
    },
    options,
  )
  return { ideas: sanitizeIdeas(raw), usage }
}

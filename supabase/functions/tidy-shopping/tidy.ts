// Passe de nettoyage d'une liste de courses générée depuis le planning.
// Le modèle ne fait que renommer (synonymes), classer par rayon et repérer les basiques du placard :
// les quantités sont calculées et additionnées par l'application, jamais par le modèle.

import { callTool, HttpError, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'

/** Rayons (identiques à l'enum shopping_aisle et à src/lib/shopping.ts, vérifié par un test). */
export const AISLES = [
  'FRUITS_LEGUMES', 'BOULANGERIE', 'BOUCHERIE_POISSON', 'CREMERIE', 'EPICERIE_SALEE', 'EPICERIE_SUCREE', 'SURGELES', 'BOISSONS',
  'HYGIENE_MAISON', 'AUTRE',
] as const
export type Aisle = (typeof AISLES)[number]

export const MAX_LINES = 150

export interface TidyInputLine {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  aisle: Aisle
}

export interface TidyLine {
  id: string
  name: string
  aisle: Aisle
  pantry: boolean
}

const TOOL_NAME = 'ranger_courses'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre, pour chaque ligne de la liste de courses, son nom canonique, son rayon et si c’est un basique du placard.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Identifiant de la ligne reçue, inchangé.' },
            name: {
              type: 'string',
              description:
                'Nom canonique de l’article, en minuscules, au singulier, sans quantité ni préparation (« oignons jaunes émincés » → « oignon »). Deux lignes du même produit doivent recevoir exactement le même nom.',
            },
            aisle: { type: 'string', enum: [...AISLES], description: 'Rayon du magasin.' },
            pantry: { type: 'boolean', description: 'true pour un basique qu’on a presque toujours chez soi (sel, poivre, huile, épices…).' },
          },
          required: ['id', 'name', 'aisle', 'pantry'],
        },
      },
    },
    required: ['lines'],
  },
}

const SYSTEM = [
  'Tu ranges une liste de courses française, générée à partir de recettes.',
  'Pour chaque ligne reçue, renvoie une entrée avec le même id.',
  'Unifie les noms des produits identiques (pluriel, variété sans importance, préparation), mais garde distincts des produits différents (« crème fraîche » et « crème liquide »).',
  'Ne renvoie pas de quantité : elles sont calculées ailleurs.',
  `Réponds uniquement en appelant l’outil ${TOOL_NAME}.`,
].join('\n')

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const isAisle = (v: unknown): v is Aisle => typeof v === 'string' && (AISLES as readonly string[]).includes(v)

/** Lignes reçues du navigateur : validées et bornées. */
export function parseInput(body: unknown): TidyInputLine[] {
  const raw = (typeof body === 'object' && body !== null ? (body as Record<string, unknown>).lines : null) as unknown
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError('Liste vide.', 400)
  if (raw.length > MAX_LINES) throw new HttpError(`${MAX_LINES} articles au plus.`, 400)
  return raw.map((value) => {
    const line = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
    const id = str(line.id, 40)
    const name = str(line.name, 120)
    if (!id || !name) throw new HttpError('Article invalide.', 400)
    const quantity = typeof line.quantity === 'number' && Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : null
    return { id, name, quantity, unit: str(line.unit, 30) || null, aisle: isAisle(line.aisle) ? line.aisle : 'AUTRE' }
  })
}

/** Message envoyé au modèle : une ligne par article (« id | nom | quantité unité | rayon »). */
export function buildUserMessage(lines: readonly TidyInputLine[]): string {
  const rows = lines.map((l) => [l.id, l.name, [l.quantity, l.unit].filter((v) => v !== null).join(' '), l.aisle].join(' | '))
  return `Rayons possibles : ${AISLES.join(', ')}\n\nid | nom | quantité | rayon proposé\n${rows.join('\n')}`
}

/** Ne garde que des réponses sûres : identifiants connus, rayons valides, noms bornés (sinon ceux d'origine). */
export function sanitizeTidy(output: unknown, lines: readonly TidyInputLine[]): TidyLine[] {
  const data = (typeof output === 'object' && output !== null ? output : {}) as Record<string, unknown>
  const answers = new Map<string, Record<string, unknown>>()
  for (const value of Array.isArray(data.lines) ? data.lines : []) {
    if (typeof value !== 'object' || value === null) continue
    const id = str((value as Record<string, unknown>).id, 40)
    if (id && !answers.has(id)) answers.set(id, value as Record<string, unknown>)
  }
  return lines.map((line) => {
    const answer = answers.get(line.id)
    if (!answer) return { id: line.id, name: line.name, aisle: line.aisle, pantry: false }
    return {
      id: line.id,
      name: str(answer.name, 120).toLowerCase() || line.name,
      aisle: isAisle(answer.aisle) ? answer.aisle : line.aisle,
      pantry: answer.pantry === true,
    }
  })
}

export async function tidyLines(lines: readonly TidyInputLine[], options: ModelOptions): Promise<{ lines: TidyLine[]; usage: ModelUsage | null }> {
  const { input, usage } = await callTool(
    {
      system: SYSTEM,
      tool: TOOL,
      message: buildUserMessage(lines),
      maxTokens: 8192,
      failure: 'Le regroupement de la liste a échoué',
      missing: 'réponse vide',
    },
    options,
  )
  return { lines: sanitizeTidy(input, lines), usage }
}

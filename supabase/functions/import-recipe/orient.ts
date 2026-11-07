// Sens d'une photo de plat : le navigateur envoie la photo tournée des 4 façons (0°, 90°, 180°, 270°, sens horaire),
// le modèle choisit celle qui est à l'endroit. Comparer 4 versions est bien plus sûr que lui faire deviner un angle.

import { callTool, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import type { PhotoInput } from './model.ts'

export const ROTATIONS = [0, 90, 180, 270] as const
export type Rotation = (typeof ROTATIONS)[number]
const LABELS = ['A', 'B', 'C', 'D'] as const

const TOOL_NAME = 'choisir_sens'

const TOOL = {
  name: TOOL_NAME,
  description: 'Indique laquelle des 4 versions de la photo est à l’endroit.',
  input_schema: {
    type: 'object',
    properties: {
      droite: { type: 'string', enum: [...LABELS], description: 'Lettre de la version à l’endroit.' },
      sur: { type: 'boolean', description: 'false si aucune version ne se distingue nettement (photo vue du dessus, motif, flou).' },
    },
    required: ['droite', 'sur'],
  },
}

const SYSTEM = [
  'Tu reçois 4 versions de la même photo (A, B, C, D), tournées chacune d’un quart de tour de plus.',
  'Choisis celle qui est à l’endroit, comme dans un livre de cuisine : la table ou le support en bas, les verres, bouteilles, couverts et personnes debout, le texte éventuel lisible, la lumière venant plutôt du haut.',
  'Pour un plat vu du dessus, appuie-toi sur le texte, les couverts, les mains, l’ombre ou le bord de table ; si rien ne permet de trancher, réponds sur = false.',
  `Réponds uniquement en appelant l’outil ${TOOL_NAME}.`,
].join('\n')

/** Version à l'endroit parmi les 4 envoyées, dans l'ordre 0°, 90°, 180°, 270° : sa rotation, ou 0 en cas de doute. */
export async function detectRotation(candidates: readonly PhotoInput[], options: ModelOptions): Promise<{ rotation: Rotation; usage: ModelUsage | null }> {
  const message = [
    ...candidates.flatMap((photo, i) => [
      { type: 'text' as const, text: `Version ${LABELS[i]} :` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: photo.type, data: photo.data } },
    ]),
    { type: 'text' as const, text: 'Quelle version est à l’endroit ?' },
  ]
  const { input, usage } = await callTool(
    { system: SYSTEM, tool: TOOL, message, maxTokens: 2048, timeoutMs: 30_000, failure: 'La détection du sens de la photo a échoué', missing: 'réponse sans choix' },
    options,
  )
  const choice = input as { droite?: unknown; sur?: unknown } | null
  const index = LABELS.indexOf(choice?.droite as (typeof LABELS)[number])
  return { rotation: choice?.sur === true && index >= 0 ? ROTATIONS[index]! : 0, usage }
}

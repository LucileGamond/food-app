// Outils communs aux tests de knit-pattern (pas déployé : seul index.ts et ce qu'il importe le sont).

import { createHandler } from './handler.ts'

/** Petit PDF (« %PDF-1.4 ») et photo PNG d'un pixel, en base64. */
export const PDF = 'JVBERi0xLjQK'
export const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

type Usage = { input_tokens: number; output_tokens: number }

/** Réponse du modèle avec ces blocs de contenu. */
export const modelReply = (content: unknown[], usage: Usage = { input_tokens: 300, output_tokens: 200 }) =>
  new Response(JSON.stringify({ content, stop_reason: 'tool_use', usage }), { status: 200 })

/** Réponse du modèle qui appelle l'outil `name` avec `input`. */
export const toolReply = (name: string, input: unknown, usage?: Usage) => modelReply([{ type: 'tool_use', name, input }], usage)

/** Handler connecté (clé présente, personne connectée) dont le modèle renvoie `fetchModel`. */
export function knitHandler(fetchModel: typeof fetch) {
  const log = vi.fn()
  return { handle: createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true }), log }
}

/** Handler dont le modèle répond toujours `response`. */
export function handlerReplying(response: Response) {
  const fetchModel = vi.fn<typeof fetch>(async () => response)
  return { ...knitHandler(fetchModel), fetchModel }
}

export const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

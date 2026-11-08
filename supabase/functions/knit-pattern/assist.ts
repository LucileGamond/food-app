// Aides pendant le tricot (module Tricot) : question sur le rang en cours, et traduction en français du texte d'une
// étape (patron en anglais) sans toucher aux nombres des tailles.

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

export const MAX_STEP_TEXT = 20_000
const MAX_QUESTION = 500

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// ---------------------------------------------------------------------------
// Question sur le rang
// ---------------------------------------------------------------------------

export interface QuestionInput {
  question: string
  stepTitle: string
  text: string
  /** Rang de l'étape à tricoter, et taille suivie. */
  row: number | null
  size: string
  /** Abréviations du patron (« ssk : … »), pour répondre avec son vocabulaire. */
  abbreviations: string
}

/** Corps { question: { question, step_title, text, row, size, abbreviations } } ; null si ce n'est pas une question. */
export function parseQuestionInput(body: unknown): QuestionInput | null {
  const data = asRecord(body)
  if (!('question' in data)) return null
  const q = asRecord(data.question)
  const question = text(q.question, MAX_QUESTION)
  if (!question) throw new HttpError('Pose ta question.', 400)
  const row = typeof q.row === 'number' && Number.isInteger(q.row) && q.row >= 1 && q.row <= 100_000 ? q.row : null
  return {
    question,
    stepTitle: text(q.step_title, 200),
    text: text(q.text, MAX_STEP_TEXT),
    row,
    size: text(q.size, 40),
    abbreviations: text(q.abbreviations, 5000),
  }
}

export const ANSWER_TOOL: Tool = {
  name: 'repondre',
  description: 'Répond à la tricoteuse.',
  input_schema: {
    type: 'object',
    properties: { answer: { type: 'string', description: 'Réponse courte et concrète, en français.' } },
    required: ['answer'],
  },
}

const QUESTION_SYSTEM = [
  'Tu aides une tricoteuse qui suit un patron, aiguilles en main : réponds en français, court et concret (5 phrases au plus).',
  'Appuie-toi sur le texte de l’étape et sur les abréviations du patron ; utilise les nombres de sa taille.',
  'Si la réponse dépend de quelque chose qui n’est pas dans le texte, dis-le simplement au lieu d’inventer.',
].join('\n')

export async function answerQuestion(input: QuestionInput, options: ModelOptions): Promise<{ answer: string; usage: ModelUsage | null }> {
  const message = [
    `Étape : ${input.stepTitle || 'sans titre'}`,
    input.size ? `Taille suivie : ${input.size}` : null,
    input.row !== null ? `Rang à tricoter dans l’étape : ${input.row}` : null,
    input.abbreviations ? `Abréviations du patron :\n${input.abbreviations}` : null,
    `Texte de l’étape :\n${input.text || '(vide)'}`,
    `Question : ${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const { input: raw, usage } = await callTool(
    {
      system: QUESTION_SYSTEM,
      tool: ANSWER_TOOL,
      message,
      maxTokens: 1_000,
      failure: 'La réponse a échoué',
      missing: 'pas de réponse',
      timeoutMs: 45_000,
    },
    options,
  )
  const answer = text(asRecord(raw).answer, 2000)
  if (!answer) throw new HttpError('Pas de réponse : reformule ta question.', 422)
  return { answer, usage }
}

// ---------------------------------------------------------------------------
// Traduction
// ---------------------------------------------------------------------------

export interface TranslateInput {
  text: string
}

/** Corps { translate: { text } } ; null si ce n'est pas une traduction. */
export function parseTranslateInput(body: unknown): TranslateInput | null {
  const data = asRecord(body)
  if (!('translate' in data)) return null
  const t = text(asRecord(data.translate).text, MAX_STEP_TEXT)
  if (!t) throw new HttpError('Texte à traduire manquant.', 400)
  return { text: t }
}

export const TRANSLATE_TOOL: Tool = {
  name: 'enregistrer_traduction',
  description: 'Enregistre la traduction en français.',
  input_schema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Le texte traduit en français.' } },
    required: ['text'],
  },
}

const TRANSLATE_SYSTEM = [
  'Tu traduis en français le texte d’une étape de patron de tricot, pour une tricoteuse française.',
  'Garde exactement tous les nombres, dans le même ordre et avec la même ponctuation entre eux (« 60 (64-68) », « 4/6/8 »),',
  'les retours à la ligne et la structure ; traduis les termes avec le vocabulaire français du tricot',
  '(knit → endroit, purl → envers, k2tog → 2 m. ens. à l’endroit, ssk → surjet simple, yo → jeté, RS → endroit du travail…).',
  'Ne résume rien, n’ajoute rien.',
].join('\n')

/** Nombres d'un texte, dans l'ordre (« 1,5 » et « 1.5 » comptent pareil). */
export function numbersOf(value: string): string[] {
  return (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'))
}

export async function translateStep(
  input: TranslateInput,
  options: ModelOptions,
): Promise<{ text: string; numbersKept: boolean; usage: ModelUsage | null }> {
  const { input: raw, usage } = await callTool(
    {
      system: TRANSLATE_SYSTEM,
      tool: TRANSLATE_TOOL,
      message: input.text,
      maxTokens: 16_000,
      failure: 'La traduction a échoué',
      missing: 'pas de traduction',
      timeoutMs: 90_000,
    },
    options,
  )
  const translated = text(asRecord(raw).text, MAX_STEP_TEXT + 5_000)
  if (!translated) throw new HttpError('La traduction a échoué.', 502)
  // Les nombres des tailles doivent rester ceux du patron : sinon, l'application prévient.
  const numbersKept = numbersOf(translated).join(' ') === numbersOf(input.text).join(' ')
  return { text: translated, numbersKept, usage }
}

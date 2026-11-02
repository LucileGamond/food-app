// Lecture d'un patron de tricot (PDF) pour une taille : étapes, consignes réduites aux nombres de cette taille,
// rangs, mailles et actions répétées (« 2 diminutions tous les 6 rangs »).

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'

/** PDF de 20 Mo au plus (≈ 27 millions de caractères en base64). */
export const MAX_PDF_BASE64 = 28_000_000
export const MAX_STEPS = 200

export interface PatternInput {
  pdf: string
  size: string
}

export interface PatternReminder {
  every: number
  first: number | null
  times: number | null
  action: string
}

export interface PatternStep {
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  reminders: PatternReminder[]
}

export interface ReadPattern {
  title: string
  sizes: string[]
  steps: PatternStep[]
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function int(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

export function parseInput(body: unknown): PatternInput {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const pdf = typeof data.pdf === 'string' ? data.pdf : ''
  const size = str(data.size, 40)
  if (!pdf) throw new HttpError('PDF manquant.', 400)
  if (pdf.length > MAX_PDF_BASE64) throw new HttpError('PDF trop lourd (20 Mo au plus).', 413)
  if (!/^[A-Za-z0-9+/]+=*$/.test(pdf.slice(0, 1000)) || !pdf.startsWith('JVBER')) throw new HttpError('Ce fichier n’est pas un PDF.', 400)
  if (!size) throw new HttpError('Indique la taille choisie.', 400)
  return { pdf, size }
}

export const TOOL: Tool = {
  name: 'enregistrer_patron',
  description: 'Enregistre les étapes du patron pour la taille choisie.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Nom du modèle.' },
      sizes: { type: 'array', items: { type: 'string' }, description: 'Toutes les tailles proposées par le patron, dans l’ordre.' },
      size_found: { type: 'boolean', description: 'La taille demandée fait partie des tailles du patron.' },
      steps: {
        type: 'array',
        description: 'Étapes à tricoter, dans l’ordre du patron (vide si la taille est introuvable).',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Ex. « Dos – côtes », « Manches – augmentations ».' },
            instructions: {
              type: 'string',
              description: 'Consignes de l’étape en français, avec seulement les nombres de la taille choisie.',
            },
            total_rows: { type: ['integer', 'null'], description: 'Nombre de rangs (ou tours) de l’étape si on peut le connaître.' },
            stitches: { type: ['integer', 'null'], description: 'Nombre de mailles sur l’aiguille à la fin de l’étape, s’il est indiqué.' },
            reminders: {
              type: 'array',
              description: 'Actions répétées pendant l’étape, comptées en rangs depuis le début de l’étape.',
              items: {
                type: 'object',
                properties: {
                  every: { type: 'integer', description: 'Tous les N rangs.' },
                  first: { type: ['integer', 'null'], description: 'Premier rang concerné, si ce n’est pas le N-ième.' },
                  times: { type: ['integer', 'null'], description: 'Nombre de fois, s’il est indiqué.' },
                  action: { type: 'string', description: 'Ex. « 1 diminution de chaque côté ».' },
                },
                required: ['every', 'first', 'times', 'action'],
              },
            },
          },
          required: ['title', 'instructions', 'total_rows', 'stitches', 'reminders'],
        },
      },
    },
    required: ['title', 'sizes', 'size_found', 'steps'],
  },
}

export function systemPrompt(size: string): string {
  return [
    'Tu lis un patron de tricot (PDF) pour une tricoteuse qui a choisi une taille.',
    `Taille choisie : « ${size} ». Retrouve-la parmi les tailles du patron (même écrite autrement : « M » = « taille 2 » si le patron l’indique, « 4 ans » = « 4A »…).`,
    'Les patrons donnent les nombres de toutes les tailles à la suite, par exemple « monter 60 (64-68-72) m. » ou « 60/64/68/72 m. » :',
    'garde uniquement le nombre de la taille choisie, et réécris la consigne sans les autres (« monter 64 m. »).',
    'Découpe le patron en étapes de tricot dans l’ordre (dos, devant, manches, finitions…), en gardant les consignes utiles, en français.',
    'Pour chaque étape : le nombre total de rangs si tu peux le déduire (hauteur donnée seulement en cm : null), et les mailles à la fin.',
    'Repère les actions répétées (« diminuer 1 m. de chaque côté tous les 6 rangs 4 fois ») dans reminders, rangs comptés depuis le début de l’étape.',
    'Ignore la liste du matériel, les abréviations et les échantillons, sauf s’ils servent à une étape.',
    'Si la taille choisie ne fait pas partie du patron, mets size_found à false et steps vide.',
  ].join('\n')
}

function reminder(value: unknown): PatternReminder | null {
  const r = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const every = int(r.every, 1, 500)
  const action = str(r.action, 200)
  if (!every || !action) return null
  return { every, first: int(r.first, 1, 2000), times: int(r.times, 1, 500), action }
}

/** Valide et borne ce que le modèle a renvoyé. */
export function sanitizePattern(input: unknown, size: string): ReadPattern {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const sizes = (Array.isArray(data.sizes) ? data.sizes : []).map((s) => str(s, 40)).filter(Boolean).slice(0, 30)
  if (data.size_found === false) {
    throw new HttpError(
      sizes.length ? `Taille « ${size} » introuvable. Tailles du patron : ${sizes.join(', ')}.` : `Taille « ${size} » introuvable dans ce patron.`,
      422,
    )
  }
  const steps = (Array.isArray(data.steps) ? data.steps : [])
    .slice(0, MAX_STEPS)
    .map((value) => {
      const s = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
      return {
        title: str(s.title, 200),
        instructions: str(s.instructions, 5000),
        totalRows: int(s.total_rows, 1, 2000),
        stitches: int(s.stitches, 1, 5000),
        reminders: (Array.isArray(s.reminders) ? s.reminders : []).map(reminder).filter((r): r is PatternReminder => r !== null).slice(0, 10),
      }
    })
    .filter((s) => s.title)
  if (steps.length === 0) throw new HttpError('Aucune étape de tricot trouvée dans ce PDF.', 422)
  return { title: str(data.title, 200) || 'Patron sans titre', sizes, steps }
}

export async function readPattern(input: PatternInput, options: ModelOptions): Promise<{ pattern: ReadPattern; usage: ModelUsage | null }> {
  const { input: raw, usage } = await callTool(
    {
      system: systemPrompt(input.size),
      tool: TOOL,
      message: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } },
        { type: 'text', text: `Découpe ce patron en étapes pour la taille « ${input.size} ».` },
      ],
      maxTokens: 16_000,
      failure: 'La lecture du patron a échoué',
      missing: 'réponse sans étapes',
      timeoutMs: 120_000,
    },
    options,
  )
  return { pattern: sanitizePattern(raw, input.size), usage }
}

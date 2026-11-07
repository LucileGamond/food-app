// Lecture d'un patron de tricot (PDF) pour une taille : étapes, consignes réduites aux nombres de cette taille,
// rangs, mailles et déroulé en sections (rangs sans répétition, « 2 diminutions tous les 6 rangs »).

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

/** PDF de 20 Mo au plus (≈ 27 millions de caractères en base64). */
export const MAX_PDF_BASE64 = 28_000_000
export const MAX_STEPS = 200

export interface PatternInput {
  pdf: string
  size: string
}

/** Section d'une étape, dans l'ordre : rangs sans répétition, ou action répétée. */
export interface PatternSection {
  kind: 'rows' | 'repeat'
  rows: number | null
  /** null quand le patron donne une hauteur (« tous les 5 cm ») : la tricoteuse la règle en rangs. */
  every: number | null
  times: number | null
  /** Répétition : actions de chaque répétition, chacune sur un rang (1 = premier, null = dernier). */
  actions: { text: string; rank: number | null }[]
  /** Rangs sans répétition : le point (« jersey »). */
  text: string
  pattern: string | null
}

export interface PatternStep {
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  sections: PatternSection[]
}

/** Échantillon du patron : mailles et rangs pour 10 cm. */
export interface Gauge {
  stitches: number | null
  rows: number | null
}

export interface ReadPattern {
  title: string
  sizes: string[]
  steps: PatternStep[]
  gauge: Gauge | null
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function int(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

export function parseInput(body: unknown): PatternInput {
  const data = asRecord(body)
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
      gauge: {
        type: ['object', 'null'],
        description: 'Échantillon du patron ramené à 10 cm × 10 cm (null s’il n’est pas indiqué).',
        properties: {
          stitches: { type: ['number', 'null'], description: 'Mailles pour 10 cm de large.' },
          rows: { type: ['number', 'null'], description: 'Rangs pour 10 cm de haut.' },
        },
        required: ['stitches', 'rows'],
      },
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
            sections: {
              type: 'array',
              description: 'Déroulé de l’étape en sections successives, rangs comptés depuis le début de l’étape.',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['rows', 'repeat'], description: 'rows : rangs sans action particulière ; repeat : action répétée.' },
                  rows: { type: ['integer', 'null'], description: 'rows : nombre de rangs ; null si le patron donne une hauteur (cm).' },
                  every: { type: ['integer', 'null'], description: 'repeat : tous les N rangs ; null si le patron donne une hauteur (cm).' },
                  times: { type: ['integer', 'null'], description: 'repeat : nombre de fois, s’il est indiqué.' },
                  actions: {
                    type: 'array',
                    description: 'repeat : actions de chaque répétition (« 1 diminution de chaque côté »), une ou plusieurs.',
                    items: {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        rank: {
                          type: ['integer', 'null'],
                          description: 'Rang de l’action dans la répétition : 1 = premier (« au prochain rang, puis tous les 6 rangs »), null = dernier (« tous les 6 rangs »).',
                        },
                      },
                      required: ['text', 'rank'],
                    },
                  },
                  text: { type: 'string', description: 'rows : le point (« jersey »), ou vide ; repeat : vide.' },
                  pattern: { type: ['string', 'null'], description: 'Mesure telle qu’écrite dans le patron : « 5 cm », « tous les 5 cm », « tous les 6 rangs ».' },
                },
                required: ['kind', 'rows', 'every', 'times', 'actions', 'text', 'pattern'],
              },
            },
          },
          required: ['title', 'instructions', 'total_rows', 'stitches', 'sections'],
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
    'Décris le déroulé de chaque étape en sections successives (sections) : rangs sans action particulière (« tricoter 4 rangs »)',
    'et actions répétées (« diminuer 1 m. de chaque côté tous les 6 rangs 4 fois »), dans l’ordre du patron, avec la mesure telle qu’écrite dans pattern.',
    'Mesure en centimètres (« 5 cm », « tous les 5 cm ») : rows ou every à null, la tricoteuse la convertira en rangs selon sa laine.',
    'Relève l’échantillon du patron (mailles et rangs pour 10 cm) dans gauge ; ignore la liste du matériel et les abréviations, sauf s’ils servent à une étape.',
    'Si la taille choisie ne fait pas partie du patron, mets size_found à false et steps vide.',
  ].join('\n')
}

function section(value: unknown): PatternSection | null {
  const r = asRecord(value)
  const text = str(r.text, 200)
  const pattern = str(r.pattern, 100) || null
  if (r.kind === 'rows') {
    const rows = int(r.rows, 1, 2000)
    if (!rows && !pattern) return null
    return { kind: 'rows', rows, every: null, times: null, actions: [], text, pattern }
  }
  if (r.kind !== 'repeat') return null
  const every = int(r.every, 1, 500)
  const raw = Array.isArray(r.actions) ? r.actions : text ? [{ text, rank: null }] : []
  const actions = raw
    .map((value) => {
      const a = asRecord(value)
      const rank = int(a.rank, 1, 500)
      // Rang au-delà de la répétition, ou égal au dernier : « dernier rang ».
      return { text: str(a.text, 200), rank: rank !== null && every !== null && rank >= every ? null : rank }
    })
    .filter((a) => a.text)
    .slice(0, 10)
  if (actions.length === 0 || (!every && !pattern)) return null
  return { kind: 'repeat', rows: null, every, times: int(r.times, 1, 500), actions, text: '', pattern }
}

function gaugeValue(value: unknown): number | null {
  return typeof value === 'number' && value >= 1 && value <= 100 ? Math.round(value * 10) / 10 : null
}

/** Échantillon lu, ou null s'il n'y en a pas. */
export function sanitizeGauge(value: unknown): Gauge | null {
  const g = asRecord(value)
  const gauge = { stitches: gaugeValue(g.stitches), rows: gaugeValue(g.rows) }
  return gauge.stitches === null && gauge.rows === null ? null : gauge
}

/** Valide et borne ce que le modèle a renvoyé. */
export function sanitizePattern(input: unknown, size: string): ReadPattern {
  const data = asRecord(input)
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
      const s = asRecord(value)
      return {
        title: str(s.title, 200),
        instructions: str(s.instructions, 5000),
        totalRows: int(s.total_rows, 1, 2000),
        stitches: int(s.stitches, 1, 5000),
        sections: (Array.isArray(s.sections) ? s.sections : []).map(section).filter((r): r is PatternSection => r !== null).slice(0, 30),
      }
    })
    .filter((s) => s.title)
  if (steps.length === 0) throw new HttpError('Aucune étape de tricot trouvée dans ce PDF.', 422)
  return { title: str(data.title, 200) || 'Patron sans titre', sizes, steps, gauge: sanitizeGauge(data.gauge) }
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

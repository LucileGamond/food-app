// Lecture d'un patron de tricot (PDF) pour une taille : étapes, consignes réduites aux nombres de cette taille,
// rangs, mailles et déroulé en sections (rangs sans répétition, « 2 diminutions tous les 6 rangs »).

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

/** PDF de 20 Mo au plus (≈ 27 millions de caractères en base64). */
export const MAX_PDF_BASE64 = 28_000_000
export const MAX_STEPS = 200
/** Texte d'une étape recopié du patron (comme en base). */
export const MAX_INSTRUCTIONS = 20_000

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
  actions: { text: string; rank: number | null; stitches?: number }[]
  /** Rangs sans répétition : le point (« jersey »). */
  text: string
  pattern: string | null
}

export interface PatternStep {
  title: string
  instructions: string
  totalRows: number | null
  stitches: number | null
  /** Nombre de fois où l'étape se tricote (2 : les deux manches). */
  times: number
  sections: PatternSection[]
}

/** Échantillon du patron : mailles et rangs pour 10 cm. */
export interface Gauge {
  stitches: number | null
  rows: number | null
}

/**
 * Diagramme (grille) repéré dans le patron : sa page et ce qu'il faut pour le caler, proposés à la tricoteuse quand
 * elle l'ajoute à une étape (elle recadre et ajuste elle-même : le cadre exact n'est pas demandé au modèle).
 */
export interface ChartHint {
  /** Page du PDF (1 = première). */
  page: number
  title: string
  /** Lignes de la grille (rangs dessinés). */
  rows: number | null
  /** Étape où il sert (0 = première), si on le sait. */
  step: number | null
  /** À plat (allers-retours) ou en rond, si le patron le dit. */
  flat: boolean | null
  /** À plat : seuls les rangs endroit sont dessinés. */
  oddOnly: boolean
}

export const MAX_CHARTS = 30

/** Abréviation du patron et sa signification (« ssk » : « glisser 2 m. à l'endroit, les tricoter ensemble »). */
export interface Abbreviation {
  abbr: string
  meaning: string
}

export const MAX_ABBREVIATIONS = 200

/** Mesure d'une ligne du tableau des mesures (« other » : longueur totale, carrure…). */
export type ChartMeasure = 'chest' | 'waist' | 'hip' | 'arm' | 'head' | 'other'
const CHART_MEASURES = new Set<string>(['chest', 'waist', 'hip', 'arm', 'head', 'other'])

/** Tableau des mesures du patron : une valeur (cm) par taille, dans l'ordre de `sizes`. */
export interface SizeChart {
  /** « finished » : vêtement fini ; « body » : mesures du corps à qui chaque taille convient. */
  kind: 'finished' | 'body'
  /** Aisance conseillée par le patron (cm). */
  easeCm: number | null
  rows: { label: string; measure: ChartMeasure; values: (number | null)[] }[]
}

export interface ReadPattern {
  title: string
  sizes: string[]
  /** Position de la taille choisie dans `sizes` (0 = première), pour mettre ses nombres en valeur. */
  sizeIndex: number | null
  steps: PatternStep[]
  gauge: Gauge | null
  charts: ChartHint[]
  /** Abréviations expliquées dans le patron (sa légende), pour les expliquer dans le texte des étapes. */
  abbreviations: Abbreviation[]
  /** Tableau des mesures (pour conseiller une taille selon ses mesures), s'il y en a un. */
  sizeChart: SizeChart | null
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
  // Taille facultative : sans elle, les nombres comptés sont ceux de la première taille du patron.
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
      size_number: { type: ['integer', 'null'], description: 'Position de la taille demandée dans sizes (1 = première).' },
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
              description: 'Texte du patron pour cette étape, recopié mot pour mot avec les nombres de toutes les tailles : ni résumé, ni coupé, ni traduit.',
            },
            total_rows: { type: ['integer', 'null'], description: 'Nombre de rangs (ou tours) de l’étape si on peut le connaître.' },
            stitches: { type: ['integer', 'null'], description: 'Nombre de mailles sur l’aiguille à la fin de l’étape, s’il est indiqué.' },
            times: {
              type: 'integer',
              description: 'Nombre de fois où l’étape se tricote à l’identique : 2 pour « Manches (x2) », « tricoter 2 manches », « faire un 2e devant identique » ; 1 sinon.',
            },
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
                        stitches: {
                          type: ['integer', 'null'],
                          description:
                            'Mailles ajoutées (positif) ou retirées (négatif) à chaque fois : -2 pour « 1 diminution de chaque côté », +1 pour « 1 augmentation », 0 pour « placer un marqueur » ; null si le patron ne permet pas de le savoir.',
                        },
                      },
                      required: ['text', 'rank', 'stitches'],
                    },
                  },
                  text: { type: 'string', description: 'rows : le point (« jersey »), ou vide ; repeat : vide.' },
                  pattern: {
                    type: ['string', 'null'],
                    description:
                      'Mesure telle qu’écrite dans le patron, pour la taille choisie seulement et avec son unité : « 5 cm », « tous les 5 cm », « 2 in », « tous les 6 rangs ».',
                  },
                },
                required: ['kind', 'rows', 'every', 'times', 'actions', 'text', 'pattern'],
              },
            },
          },
          required: ['title', 'instructions', 'total_rows', 'stitches', 'times', 'sections'],
        },
      },
      charts: {
        type: 'array',
        description: 'Diagrammes (grilles de symboles ou de couleurs) du patron utiles à la taille choisie ; vide s’il n’y en a pas.',
        items: {
          type: 'object',
          properties: {
            page: { type: 'integer', description: 'Page du PDF où se trouve la grille (1 = première page du fichier).' },
            title: { type: 'string', description: 'Nom du diagramme tel qu’écrit (« Diagramme A », « Torsade », « Jacquard du devant »).' },
            last_row: { type: ['integer', 'null'], description: 'Plus grand numéro de rang écrit le long de la grille (null s’il n’est pas lisible).' },
            odd_only: { type: 'boolean', description: 'Seuls les rangs impairs (endroit) sont dessinés ou numérotés (1, 3, 5…).' },
            flat: { type: ['boolean', 'null'], description: 'true : tricot à plat (allers-retours) ; false : en rond ; null si le patron ne le dit pas.' },
            step: { type: ['integer', 'null'], description: 'Numéro de l’étape (dans steps, 1 = première) où le diagramme se tricote, s’il y en a une.' },
          },
          required: ['page', 'title', 'last_row', 'odd_only', 'flat', 'step'],
        },
      },
      size_chart: {
        type: ['object', 'null'],
        description: 'Tableau des mesures par taille (null s’il n’y en a pas), en centimètres.',
        properties: {
          kind: {
            type: 'string',
            enum: ['finished', 'body'],
            description: 'finished : mesures du vêtement fini ; body : mesures du corps à qui chaque taille convient.',
          },
          ease_cm: { type: ['number', 'null'], description: 'Aisance conseillée par le patron, en cm (null si non indiquée).' },
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Nom de la mesure tel qu’écrit (« Tour de poitrine », « Longueur totale »).' },
                measure: {
                  type: 'string',
                  enum: ['chest', 'waist', 'hip', 'arm', 'head', 'other'],
                  description: 'chest : tour de poitrine ; waist : tour de taille ; hip : tour de hanches ; arm : longueur de manche ou de bras ; head : tour de tête ; other : le reste.',
                },
                values_cm: { type: 'array', items: { type: ['number', 'null'] }, description: 'Une valeur en cm par taille, dans l’ordre de sizes (null si absente).' },
              },
              required: ['label', 'measure', 'values_cm'],
            },
          },
        },
        required: ['kind', 'ease_cm', 'rows'],
      },
      abbreviations: {
        type: 'array',
        description: 'Abréviations et symboles expliqués par le patron (sa légende), tels qu’écrits ; vide s’il n’y en a pas.',
        items: {
          type: 'object',
          properties: {
            abbr: { type: 'string', description: 'L’abréviation telle qu’écrite dans le texte (« ssk », « 2 m. ens. », « jeté »).' },
            meaning: { type: 'string', description: 'Sa signification, en français, en une phrase.' },
          },
          required: ['abbr', 'meaning'],
        },
      },
    },
    required: ['title', 'sizes', 'size_found', 'steps', 'charts', 'abbreviations'],
  },
}

export function systemPrompt(size: string): string {
  const chosen = size
    ? [
        'Tu lis un patron de tricot (PDF) pour une tricoteuse qui a choisi une taille.',
        `Taille choisie : « ${size} ». Retrouve-la parmi les tailles du patron (même écrite autrement : « M » = « taille 2 » si le patron l’indique, « 4 ans » = « 4A »…).`,
      ]
    : [
        'Tu lis un patron de tricot (PDF) pour une tricoteuse qui n’a pas encore choisi de taille.',
        'Prends la première taille du patron comme taille choisie (size_found à true) ; un patron en taille unique a une seule taille.',
      ]
  return [
    ...chosen,
    'Les patrons donnent les nombres de toutes les tailles à la suite, par exemple « monter 60 (64-68-72) m. » ou « 60/64/68/72 m. ».',
    'Découpe le patron en étapes de tricot dans l’ordre (dos, devant, manches, finitions…).',
    'Dans instructions, recopie mot pour mot le texte du patron pour l’étape, avec les nombres de toutes les tailles tels qu’écrits :',
    'ne résume rien, ne coupe rien, ne traduis pas ; garde les retours à la ligne utiles. L’application mettra en valeur les nombres de la taille choisie.',
    'Donne dans size_number la position de la taille choisie parmi sizes (1 = première).',
    'Pour chaque étape, avec les nombres de la taille choisie : le nombre total de rangs si tu peux le déduire (hauteur donnée seulement en cm : null), et les mailles à la fin.',
    'Décris le déroulé de chaque étape en sections successives (sections) : rangs sans action particulière (« tricoter 4 rangs »)',
    'et actions répétées (« diminuer 1 m. de chaque côté tous les 6 rangs 4 fois »), dans l’ordre du patron, avec la mesure telle qu’écrite dans pattern.',
    'Mesure en longueur (« 5 cm », « tous les 5 cm », « 2 in ») : rows ou every à null, et dans pattern la seule valeur de la taille choisie avec son unité ;',
    'l’application la convertira en rangs avec l’échantillon.',
    'Une partie tricotée plusieurs fois à l’identique (les deux manches, « x2 », un 2e devant « en vis-à-vis » sans autre différence) : une seule étape, avec times à 2 ;',
    'sinon times à 1. Deux parties qui diffèrent (devant gauche et devant droit aux diminutions inversées) restent deux étapes.',
    'Repère les diagrammes (grilles de symboles ou de couleurs) dans charts : page du PDF, nom, plus grand numéro de rang de la grille,',
    'rangs endroit seuls ou non, à plat ou en rond, et l’étape où il se tricote ; un diagramme propre à une autre taille est ignoré.',
    'Relève dans size_chart le tableau des mesures par taille (tour de poitrine, longueur…), converti en cm, une valeur par taille dans l’ordre de sizes,',
    'en précisant s’il s’agit des mesures du vêtement fini ou du corps, et l’aisance conseillée si le patron la donne.',
    'Relève dans abbreviations les abréviations expliquées par le patron (sa légende), telles qu’écrites, avec leur sens en français.',
    'Relève l’échantillon du patron (mailles et rangs pour 10 cm) dans gauge ; ignore la liste du matériel et les abréviations, sauf s’ils servent à une étape.',
    'Si la taille choisie ne fait pas partie du patron, mets size_found à false et steps vide.',
  ].join('\n')
}

/** Section bien formée (bornée), ou null. */
export function sanitizeSection(value: unknown): PatternSection | null {
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
      const stitches = int(a.stitches, -200, 200)
      return { text: str(a.text, 200), rank: rank !== null && every !== null && rank >= every ? null : rank, ...(stitches !== null ? { stitches } : {}) }
    })
    .filter((a) => a.text)
    .slice(0, 10)
  if (actions.length === 0 || (!every && !pattern)) return null
  return { kind: 'repeat', rows: null, every, times: int(r.times, 1, 500), actions, text: '', pattern }
}

/** Diagrammes repérés, bornés : page dans le PDF, étape parmi celles lues. */
export function sanitizeCharts(value: unknown, stepCount: number): ChartHint[] {
  return (Array.isArray(value) ? value : [])
    .map((v): ChartHint | null => {
      const c = asRecord(v)
      const page = int(c.page, 1, 2000)
      if (page === null) return null
      const flat = typeof c.flat === 'boolean' ? c.flat : null
      // Rangs endroit seuls : seulement à plat ; une ligne de la grille pour deux rangs.
      const oddOnly = c.odd_only === true && flat !== false
      const lastRow = int(c.last_row, 1, 1000)
      const step = int(c.step, 1, stepCount)
      return {
        page,
        title: str(c.title, 100),
        rows: lastRow === null ? null : Math.min(oddOnly ? Math.ceil(lastRow / 2) : lastRow, 500),
        step: step === null ? null : step - 1,
        flat,
        oddOnly,
      }
    })
    .filter((c): c is ChartHint => c !== null)
    .slice(0, MAX_CHARTS)
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

/** Abréviations lues, bornées, une fois chacune. */
export function sanitizeAbbreviations(value: unknown): Abbreviation[] {
  const seen = new Set<string>()
  return (Array.isArray(value) ? value : [])
    .flatMap((v): Abbreviation[] => {
      const a = asRecord(v)
      const abbr = str(a.abbr, 40)
      const meaning = str(a.meaning, 300)
      if (!abbr || !meaning || seen.has(abbr)) return []
      seen.add(abbr)
      return [{ abbr, meaning }]
    })
    .slice(0, MAX_ABBREVIATIONS)
}

function cm(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? Math.round(value * 10) / 10 : null
}

/** Tableau des mesures lu, aligné sur les tailles ; null s'il est absent ou vide. */
export function sanitizeSizeChart(value: unknown, sizeCount: number): SizeChart | null {
  const c = asRecord(value)
  if (sizeCount === 0 || (c.kind !== 'finished' && c.kind !== 'body')) return null
  const rows = (Array.isArray(c.rows) ? c.rows : [])
    .flatMap((v): SizeChart['rows'] => {
      const r = asRecord(v)
      const label = str(r.label, 80)
      const measure = typeof r.measure === 'string' && CHART_MEASURES.has(r.measure) ? (r.measure as ChartMeasure) : 'other'
      const values = Array.from({ length: sizeCount }, (_, i) => cm(Array.isArray(r.values_cm) ? r.values_cm[i] : null, 400))
      return label && values.some((x) => x !== null) ? [{ label, measure, values }] : []
    })
    .slice(0, 20)
  if (rows.length === 0) return null
  const ease = typeof c.ease_cm === 'number' && Number.isFinite(c.ease_cm) && c.ease_cm >= -20 && c.ease_cm <= 60 ? Math.round(c.ease_cm * 10) / 10 : null
  return { kind: c.kind, easeCm: ease, rows }
}

/** Position de la taille choisie : celle donnée par le modèle, sinon la même écriture dans la liste (« m » = « M »). */
function sizeIndex(value: unknown, sizes: string[], size: string): number | null {
  const number = int(value, 1, sizes.length)
  if (number !== null) return number - 1
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  // Sans taille choisie : la première, prise pour les nombres comptés.
  if (!size) return sizes.length ? 0 : null
  const index = sizes.findIndex((s) => key(s) === key(size))
  return index === -1 ? null : index
}

/** Valide et borne ce que le modèle a renvoyé. */
export function sanitizePattern(input: unknown, size: string): ReadPattern {
  const data = asRecord(input)
  const sizes = (Array.isArray(data.sizes) ? data.sizes : []).map((s) => str(s, 40)).filter(Boolean).slice(0, 30)
  // Sans taille choisie, la première taille est prise : rien d'introuvable.
  if (size && data.size_found === false) {
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
        instructions: str(s.instructions, MAX_INSTRUCTIONS),
        totalRows: int(s.total_rows, 1, 2000),
        stitches: int(s.stitches, 1, 5000),
        times: int(s.times, 1, 10) ?? 1,
        sections: (Array.isArray(s.sections) ? s.sections : []).map(sanitizeSection).filter((r): r is PatternSection => r !== null).slice(0, 30),
      }
    })
    .filter((s) => s.title)
  if (steps.length === 0) throw new HttpError('Aucune étape de tricot trouvée dans ce PDF.', 422)
  return {
    title: str(data.title, 200) || 'Patron sans titre',
    sizes,
    sizeIndex: sizeIndex(data.size_number, sizes, size),
    steps,
    gauge: sanitizeGauge(data.gauge),
    charts: sanitizeCharts(data.charts, steps.length),
    abbreviations: sanitizeAbbreviations(data.abbreviations),
    sizeChart: sanitizeSizeChart(data.size_chart, sizes.length),
  }
}

export async function readPattern(input: PatternInput, options: ModelOptions): Promise<{ pattern: ReadPattern; usage: ModelUsage | null }> {
  const { input: raw, usage } = await callTool(
    {
      system: systemPrompt(input.size),
      tool: TOOL,
      message: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } },
        { type: 'text', text: input.size ? `Découpe ce patron en étapes pour la taille « ${input.size} ».` : 'Découpe ce patron en étapes (aucune taille choisie : prends la première).' },
      ],
      // Texte recopié tel quel : plus long qu'un résumé.
      maxTokens: 32_000,
      failure: 'La lecture du patron a échoué',
      missing: 'réponse sans étapes',
      timeoutMs: 120_000,
    },
    options,
  )
  return { pattern: sanitizePattern(raw, input.size), usage }
}

// Lecture de l'étiquette (bande) d'une pelote en photo : marque, nom, coloris, bain, composition, poids, métrage,
// aiguilles conseillées. La tricoteuse vérifie la fiche avant de l'enregistrer.

import { callTool, HttpError, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'

/** Photo réduite par l'application : 5 Mo au plus en base64. */
export const MAX_LABEL_BASE64 = 7_000_000
export const LABEL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type LabelType = (typeof LABEL_TYPES)[number]

export interface LabelInput {
  label: string
  mediaType: LabelType
}

export interface Yarn {
  brand: string | null
  name: string | null
  color: string | null
  dye_lot: string | null
  composition: string | null
  weight_g: number | null
  length_m: number | null
  needle_mm: number | null
}

/** Corps { label: base64, media_type } ; null si ce n'est pas une demande de lecture d'étiquette. */
export function parseLabelInput(body: unknown): LabelInput | null {
  const data = asRecord(body)
  if (!('label' in data)) return null
  const label = typeof data.label === 'string' ? data.label : ''
  if (!label) throw new HttpError('Photo manquante.', 400)
  if (label.length > MAX_LABEL_BASE64) throw new HttpError('Photo trop lourde.', 413)
  if (!LABEL_TYPES.includes(data.media_type as LabelType)) throw new HttpError('Format de photo non pris en charge (JPEG, PNG ou WebP).', 400)
  if (!/^[A-Za-z0-9+/]+=*$/.test(label.slice(0, 1000))) throw new HttpError('Photo illisible.', 400)
  return { label, mediaType: data.media_type as LabelType }
}

export const YARN_TOOL: Tool = {
  name: 'enregistrer_laine',
  description: 'Enregistre les informations lues sur l’étiquette de la pelote.',
  input_schema: {
    type: 'object',
    properties: {
      is_label: { type: 'boolean', description: 'La photo montre bien une étiquette (bande) de pelote de laine.' },
      brand: { type: ['string', 'null'], description: 'Marque (« Phildar », « DROPS »).' },
      name: { type: ['string', 'null'], description: 'Nom de la laine (« Partner 3.5 », « Merino Extra Fine »).' },
      color: { type: ['string', 'null'], description: 'Coloris : nom et/ou numéro (« 0012 Ciel »).' },
      dye_lot: { type: ['string', 'null'], description: 'Numéro de bain (lot, « Lot », « Bain », « Dye lot »).' },
      composition: { type: ['string', 'null'], description: 'Composition en français (« 100 % mérinos », « 50 % laine, 50 % acrylique »).' },
      weight_g: { type: ['integer', 'null'], description: 'Poids d’une pelote en grammes.' },
      length_m: { type: ['integer', 'null'], description: 'Métrage d’une pelote en mètres (convertir les yards : 1 yd = 0,9144 m).' },
      needle_mm: { type: ['number', 'null'], description: 'Aiguilles conseillées en mm (la plus petite si une fourchette « 3,5-4 »).' },
    },
    required: ['is_label', 'brand', 'name', 'color', 'dye_lot', 'composition', 'weight_g', 'length_m', 'needle_mm'],
  },
}

const SYSTEM = [
  'Tu lis la photo de l’étiquette (bande) d’une pelote de laine pour une tricoteuse.',
  'Relève seulement ce qui est écrit ; laisse à null ce qui est absent ou illisible, sans rien deviner.',
  'Les symboles d’entretien et les pictogrammes d’aiguilles donnent souvent la taille d’aiguilles conseillée.',
  'Si la photo ne montre pas une étiquette de laine, mets is_label à false.',
].join('\n')

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null
}

function whole(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.round(value) >= min && Math.round(value) <= max ? Math.round(value) : null
}

/** Valide et borne ce que le modèle a renvoyé (mêmes bornes que la base : knit_yarns_are_valid). */
export function sanitizeYarn(input: unknown): Yarn {
  const data = asRecord(input)
  if (data.is_label === false) throw new HttpError('Pas d’étiquette de laine sur cette photo.', 422)
  const needle = typeof data.needle_mm === 'number' && data.needle_mm >= 1 && data.needle_mm <= 30 ? Math.round(data.needle_mm * 100) / 100 : null
  const yarn = {
    brand: text(data.brand),
    name: text(data.name),
    color: text(data.color),
    dye_lot: text(data.dye_lot),
    composition: text(data.composition),
    weight_g: whole(data.weight_g, 1, 1000),
    length_m: whole(data.length_m, 1, 5000),
    needle_mm: needle,
  }
  if (Object.values(yarn).every((v) => v === null)) throw new HttpError('Rien de lisible sur cette étiquette.', 422)
  return yarn
}

export async function readYarnLabel(input: LabelInput, options: ModelOptions): Promise<{ yarn: Yarn; usage: ModelUsage | null }> {
  const { input: raw, usage } = await callTool(
    {
      system: SYSTEM,
      tool: YARN_TOOL,
      message: [
        { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.label } },
        { type: 'text', text: 'Relève les informations de cette étiquette de laine.' },
      ],
      maxTokens: 1_000,
      failure: 'La lecture de l’étiquette a échoué',
      missing: 'réponse sans laine',
      timeoutMs: 45_000,
    },
    options,
  )
  return { yarn: sanitizeYarn(raw), usage }
}

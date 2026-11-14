// Infos d'un patron de la bibliothèque lues par le modèle, à la demande (« Remplir avec l'IA ») : nom, tailles, métrage par
// taille, aiguilles, laine conseillée et type d'ouvrage. Lecture courte (pas les étapes) : bien moins chère que la lecture
// complète d'un patron. La tricoteuse vérifie la fiche avant de l'enregistrer.

import { callTool, HttpError, type MessageContent, type ModelOptions, type ModelUsage, type Tool } from '../_shared/anthropic.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { MAX_PDF_BASE64 } from './pattern.ts'
import { LABEL_TYPES, MAX_LABEL_BASE64, type LabelType } from './yarn.ts'

/** Pages photographiées (magazine, livre) envoyées au plus. */
export const MAX_INFO_PHOTOS = 4
const MAX_SIZES = 30

export interface InfoInput {
  /** PDF du patron (base64), ou photos de ses pages. */
  pdf: string | null
  photos: { data: string; mediaType: LabelType }[]
}

export interface PatternInfo {
  title: string | null
  /** Tailles du patron (vide : taille unique). */
  sizes: string[]
  /** Métrage total par taille, dans l'ordre des tailles (une valeur pour une taille unique). */
  meters: (number | null)[]
  needleMm: number | null
  /** Laine conseillée (« DROPS Alpaca, 4 pelotes »). */
  yarn: string | null
  /** Type d'ouvrage en un ou deux mots (« pull », « bonnet »). */
  kind: string | null
}

const BASE64 = /^[A-Za-z0-9+/]+=*$/

/** Corps { info: { pdf } } ou { info: { photos: [{ data, media_type }] } } ; null si ce n'est pas une demande d'infos. */
export function parseInfoInput(body: unknown): InfoInput | null {
  const data = asRecord(body)
  if (!('info' in data)) return null
  const info = asRecord(data.info)
  const pdf = typeof info.pdf === 'string' && info.pdf ? info.pdf : null
  const photos = Array.isArray(info.photos) ? info.photos : []
  if (!pdf && photos.length === 0) throw new HttpError('Patron manquant : un PDF ou des photos.', 400)
  if (pdf) {
    if (pdf.length > MAX_PDF_BASE64) throw new HttpError('PDF trop lourd (20 Mo au plus).', 413)
    if (!BASE64.test(pdf.slice(0, 1000)) || !pdf.startsWith('JVBER')) throw new HttpError('Ce fichier n’est pas un PDF.', 400)
    return { pdf, photos: [] }
  }
  if (photos.length > MAX_INFO_PHOTOS) throw new HttpError(`${MAX_INFO_PHOTOS} photos au plus.`, 400)
  return {
    pdf: null,
    photos: photos.map((raw) => {
      const photo = asRecord(raw)
      const value = typeof photo.data === 'string' ? photo.data : ''
      if (!value || !BASE64.test(value.slice(0, 1000))) throw new HttpError('Photo illisible.', 400)
      if (value.length > MAX_LABEL_BASE64) throw new HttpError('Photo trop lourde.', 413)
      if (!LABEL_TYPES.includes(photo.media_type as LabelType)) throw new HttpError('Format de photo non pris en charge (JPEG, PNG ou WebP).', 400)
      return { data: value, mediaType: photo.media_type as LabelType }
    }),
  }
}

export const INFO_TOOL: Tool = {
  name: 'enregistrer_infos',
  description: 'Enregistre les informations générales du patron de tricot.',
  input_schema: {
    type: 'object',
    properties: {
      is_pattern: { type: 'boolean', description: 'Le document est bien un patron de tricot (ou de crochet).' },
      title: { type: ['string', 'null'], description: 'Nom du modèle (« Pull Bergamote »), sans la marque ni le numéro de magazine.' },
      sizes: { type: 'array', items: { type: 'string' }, description: 'Tailles du patron dans l’ordre (« S », « M », « 2 ans ») ; vide pour une taille unique.' },
      meters: {
        type: 'array',
        items: { type: ['integer', 'null'] },
        description: 'Métrage total de laine en mètres pour chaque taille, dans l’ordre des tailles (une seule valeur pour une taille unique). Calcule pelotes × métrage par pelote si besoin ; convertis les yards (1 yd = 0,9144 m). null si inconnu.',
      },
      needle_mm: { type: ['number', 'null'], description: 'Aiguilles principales en mm (celles du corps de l’ouvrage, pas celles des côtes).' },
      yarn: { type: ['string', 'null'], description: 'Laine conseillée, courte (« DROPS Alpaca », « Phildar Partner 3.5 »).' },
      kind: { type: ['string', 'null'], description: 'Type d’ouvrage en un ou deux mots, en français et en minuscules (« pull », « gilet », « bonnet », « châle », « chaussettes »).' },
    },
    required: ['is_pattern', 'title', 'sizes', 'meters', 'needle_mm', 'yarn', 'kind'],
  },
}

const SYSTEM = [
  'Tu lis un patron de tricot pour une tricoteuse qui le range dans sa bibliothèque.',
  'Relève seulement les informations générales demandées, telles qu’écrites ; laisse à null ce qui est absent, sans deviner.',
  'Si le document n’est pas un patron de tricot ou de crochet, mets is_pattern à false.',
].join('\n')

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, max).trim() : null
}

/** Valide et borne ce que le modèle a renvoyé (bornes de la fiche : métrage 1-20 000 m, aiguilles 1-30 mm). */
export function sanitizeInfo(input: unknown): PatternInfo {
  const data = asRecord(input)
  if (data.is_pattern === false) throw new HttpError('Ce document ne ressemble pas à un patron de tricot.', 422)
  const sizes = (Array.isArray(data.sizes) ? data.sizes : []).map((s) => text(s, 40)).filter((s): s is string => s !== null).slice(0, MAX_SIZES)
  const rawMeters = Array.isArray(data.meters) ? data.meters : []
  const meters = Array.from({ length: Math.max(sizes.length, 1) }, (_, i) => {
    const m = rawMeters[i]
    return typeof m === 'number' && Number.isFinite(m) && Math.round(m) >= 1 && Math.round(m) <= 20_000 ? Math.round(m) : null
  })
  const needle = typeof data.needle_mm === 'number' && data.needle_mm >= 1 && data.needle_mm <= 30 ? Math.round(data.needle_mm * 100) / 100 : null
  const info = { title: text(data.title, 200), sizes, meters, needleMm: needle, yarn: text(data.yarn, 200), kind: text(data.kind, 30)?.toLowerCase() ?? null }
  if (!info.title && sizes.length === 0 && meters.every((m) => m === null) && !needle && !info.yarn) throw new HttpError('Rien de lisible dans ce patron.', 422)
  return info
}

export async function readPatternInfo(input: InfoInput, options: ModelOptions): Promise<{ info: PatternInfo; usage: ModelUsage | null }> {
  const pages: Exclude<MessageContent, string> = input.pdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } }]
    : input.photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType, data: p.data } }))
  const { input: raw, usage } = await callTool(
    {
      system: SYSTEM,
      tool: INFO_TOOL,
      message: [...pages, { type: 'text', text: 'Relève les informations générales de ce patron.' }],
      maxTokens: 1_000,
      failure: 'La lecture du patron a échoué',
      missing: 'réponse sans infos',
      timeoutMs: 60_000,
    },
    options,
  )
  return { info: sanitizeInfo(raw), usage }
}

// Appels au modèle (fonction knit-pattern), payants : lecture du patron, adaptation, étiquette, question, traduction,
// idées de modèles. Rien n'est enregistré ici.

import { AppError } from '@/api/errors'
import { compressForReading } from '@/lib/image'
import { ideasFromJson, ideaYarn, yarnFromJson, type FoundPattern, type Gauge, type Yarn, type YarnIdea } from '../lib/yarn'
import { MAX_INFO_PHOTOS, type PatternFiles, type PatternInfo } from '../lib/library'
import { readPatternFromResponse } from '../lib/readings'
import { adaptedStepsFromResponse, type AdaptedStep } from '../lib/adapt'
import type { Abbreviation } from '../lib/glossary'
import type { KnitStep, ReadPattern } from '../lib/pattern'
import { checkPdf, fileToBase64, PATTERN_BUCKET, PROGRESS_BUCKET, READ_TIMEOUT_MS, type KnitContext } from './shared'

export function aiApi({ invokeKnit, downloadFrom }: KnitContext) {
  return {
    /** Lit le patron (PDF) pour la taille choisie, sans rien enregistrer. */
    async readPattern(pdf: File, size: string): Promise<ReadPattern> {
      checkPdf(pdf)
      const read = await invokeKnit<ReadPattern>({ pdf: await fileToBase64(pdf), size }, 'La lecture du patron a échoué.', (d) => Array.isArray(d.steps), READ_TIMEOUT_MS)
      return readPatternFromResponse(read, size)
    },

    /**
     * « Patron adapté à moi » : étapes recalculées pour l'échantillon et les retouches, sans rien enregistrer
     * (seulement celles qui changent).
     */
    async adaptPattern(input: { request: string; size: string; patternGauge: Gauge; myGauge: Gauge; steps: KnitStep[] }): Promise<AdaptedStep[]> {
      const { steps } = await invokeKnit<{ steps: { index: number; totalRows: number | null; stitches: number | null; sections: unknown; note: string }[] }>(
        {
          adapt: {
            request: input.request,
            size: input.size,
            pattern_gauge: input.patternGauge,
            my_gauge: input.myGauge,
            steps: input.steps.map((s) => ({ title: s.title, instructions: s.translation || s.instructions, total_rows: s.totalRows, stitches: s.stitches, sections: s.sections })),
          },
        },
        'L’adaptation du patron a échoué.',
        (d) => Array.isArray(d.steps),
        READ_TIMEOUT_MS,
      )
      return adaptedStepsFromResponse(input.steps, steps)
    },

    /**
     * « Remplir avec l'IA » : infos générales du patron (nom, tailles, métrage, aiguilles, laine, type) lues dans son PDF,
     * sinon dans ses premières photos (pages d'un magazine). Payant : seulement à la demande.
     */
    async readPatternInfo(files: PatternFiles): Promise<PatternInfo> {
      let body: Record<string, unknown>
      if (files.newPdf || files.pdfPath) {
        const pdf = files.newPdf ?? (await downloadFrom(PATTERN_BUCKET, files.pdfPath!, 'Impossible de récupérer le PDF du patron.'))
        body = { info: { pdf: await fileToBase64(pdf) } }
      } else {
        const photos = await Promise.all(
          files.photos.slice(0, MAX_INFO_PHOTOS).map(async (photo) => {
            const blob = typeof photo === 'string' ? await downloadFrom(PROGRESS_BUCKET, photo, 'Impossible de récupérer les photos du patron.') : photo
            return { data: await fileToBase64(blob), media_type: blob.type || 'image/jpeg' }
          }),
        )
        if (photos.length === 0) throw new AppError('Ajoute d’abord le PDF ou des photos du patron.')
        body = { info: { photos } }
      }
      return invokeKnit<PatternInfo>(body, 'La lecture du patron a échoué.', (d) => Array.isArray(d.sizes) && Array.isArray(d.meters), READ_TIMEOUT_MS)
    },

    /** Lit l'étiquette d'une pelote en photo, sans rien enregistrer. */
    async readYarnLabel(photo: File): Promise<Yarn> {
      const image = await compressForReading(photo)
      const read = await invokeKnit<Omit<Yarn, 'skeins'>>(
        { label: await fileToBase64(image), media_type: image.type || 'image/jpeg' },
        'La lecture de l’étiquette a échoué.',
        (d) => typeof d === 'object',
      )
      // Les couleurs vues sur la photo sont revérifiées (format, 3 au plus).
      return { ...yarnFromJson(read), skeins: null }
    },

    /** Question sur le rang en cours : réponse courte du modèle, avec le texte de l'étape en contexte. */
    async askAboutStep(input: { question: string; stepTitle: string; text: string; row: number | null; size: string; abbreviations: Abbreviation[] }): Promise<string> {
      const { answer } = await invokeKnit<{ answer: string }>(
        {
          question: {
            question: input.question,
            step_title: input.stepTitle,
            text: input.text,
            row: input.row,
            size: input.size,
            abbreviations: input.abbreviations.map((a) => `${a.abbr} : ${a.meaning}`).join('\n'),
          },
        },
        'La réponse a échoué.',
        (d) => typeof d.answer === 'string',
      )
      return answer
    },

    /** Texte d'une étape traduit en français ; `numbersKept` : les nombres des tailles sont restés ceux du patron. */
    async translateText(text: string): Promise<{ text: string; numbersKept: boolean }> {
      return invokeKnit<{ text: string; numbersKept: boolean }>({ translate: { text } }, 'La traduction a échoué.', (d) => typeof d.text === 'string', READ_TIMEOUT_MS)
    },

    /**
     * Idées de modèles pour une ou plusieurs laines (associées), selon l'envie. Sans `search`, sans recherche web ni
     * patrons (quelques dixièmes de centime) ; avec, de vrais patrons trouvés sur internet (jusqu'à 2 minutes).
     */
    async yarnIdeas(yarns: Yarn[], { wish = '', search = false }: { wish?: string; search?: boolean } = {}): Promise<{ ideas: YarnIdea[]; weight: string | null }> {
      const { ideas, weight } = await invokeKnit<{ ideas: unknown; weight?: string | null }>(
        { ideas: { yarns: yarns.map(ideaYarn), wish: wish.trim(), search } },
        'La recherche d’idées a échoué.',
        (d) => Array.isArray(d.ideas),
        // Recherche web comprise : jusqu'à 2 minutes côté modèle.
        READ_TIMEOUT_MS,
      )
      // La fonction renvoie toujours la grosseur (null si inconnue).
      return { ideas: ideasFromJson(ideas), weight: weight as string | null }
    },

    /** Vrais patrons trouvés sur internet pour une idée choisie (2 recherches web au plus). */
    async ideaPatterns(idea: YarnIdea, yarns: Yarn[], weight: string | null): Promise<FoundPattern[]> {
      const { patterns } = await invokeKnit<{ patterns: unknown }>(
        { idea_patterns: { idea: { title: idea.title, search: idea.search, size: idea.size, meters: idea.meters, needle_mm: idea.needleMm }, yarns: yarns.map(ideaYarn), weight } },
        'La recherche de patrons a échoué.',
        (d) => Array.isArray(d.patterns),
        READ_TIMEOUT_MS,
      )
      return ideasFromJson([{ title: idea.title, patterns }])[0]!.patterns
    },
  }
}

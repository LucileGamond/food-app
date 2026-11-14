// Logique de la fonction knit-pattern (module Tricot), indépendante de Deno pour pouvoir être testée.
//
// POST { pdf: base64, size }
//   → 200 { title, sizes, steps: [{ title, instructions, totalRows, stitches, sections }], gauge }
// POST { label: base64, media_type }   (photo de l'étiquette d'une pelote)
//   → 200 { brand, name, color, dye_lot, composition, weight_g, length_m, needle_mm }
// POST { question: { question, step_title, text, row, size, abbreviations } }   (question sur le rang en cours)
//   → 200 { answer }
// POST { translate: { text } }   (texte d'une étape traduit en français, nombres inchangés)
//   → 200 { text, numbersKept }
// POST { adapt: { request, size, pattern_gauge, my_gauge, steps: [{ title, instructions, total_rows, stitches, sections }] } }
//   → 200 { steps: [{ index, totalRows, stitches, sections, note }] }   (patron adapté : seulement les étapes qui changent)
// POST { ideas: { yarns: [{ yarn: description, meters, needle_mm }], wish, search } }   (idées pour des laines du stock)
//   → 200 { ideas: [{ title, why, size, meters, needleMm, search, patterns: [{ title, url, free, language }] }], weight }
//   (search: false → sans recherche web ; patrons de Ravelry pour chaque idée si l'API est configurée)
// POST { idea_patterns: { idea: { title, search, size, meters, needle_mm }, yarns, weight } }   (patrons d'une idée)
//   → 200 { patterns: [{ title, url, free, language }] }   (recherche web)
// POST { info: { pdf } | { photos: [{ data, media_type }] } }   (infos générales d'un patron de la bibliothèque, à la demande)
//   → 200 { title, sizes, meters, needleMm, yarn, kind }
// POST { link: { url } }   (patron ajouté à la bibliothèque par un lien, sans le modèle)
//   → 200 { url, title, image: { data, type } | null, pdf: { data, name } | null }
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { adaptPattern, parseAdaptInput, type AdaptInput } from './adapt.ts'
import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { answerQuestion, parseQuestionInput, parseTranslateInput, translateStep, type QuestionInput, type TranslateInput } from './assist.ts'
import { parseInput, readPattern, type PatternInput } from './pattern.ts'
import { findIdeaPatterns, parseIdeaPatternsInput, parseIdeasInput, suggestIdeas, type IdeaPatternsInput, type IdeasInput, type IdeaYarn, type YarnIdea } from './ideas.ts'
import { parseLabelInput, readYarnLabel, type LabelInput } from './yarn.ts'
import { parseInfoInput, readPatternInfo, type InfoInput } from './info.ts'
import { parseLinkInput, readLink, type LinkDeps, type LinkInput } from './link.ts'
import { ravelryConfigured, searchRavelry, type RavelryDeps } from './ravelry.ts'

/**
 * `fetchPage`, `resolveDns` : lecture d'un lien (fetch global par défaut). `ravelry` : patrons de Ravelry pour les
 * idées (sans identifiants, pas de patrons Ravelry).
 */
export type Deps = ModelDeps & Partial<LinkDeps> & { ravelry?: Partial<RavelryDeps> }

type Input =
  | { kind: 'pattern'; pattern: PatternInput }
  | { kind: 'label'; label: LabelInput }
  | { kind: 'ideas'; ideas: IdeasInput }
  | { kind: 'ideaPatterns'; ideaPatterns: IdeaPatternsInput }
  | { kind: 'question'; question: QuestionInput }
  | { kind: 'translate'; translate: TranslateInput }
  | { kind: 'adapt'; adapt: AdaptInput }
  | { kind: 'link'; link: LinkInput }
  | { kind: 'info'; info: InfoInput }

function parse(body: unknown): Input {
  const link = parseLinkInput(body)
  if (link) return { kind: 'link', link }
  const info = parseInfoInput(body)
  if (info) return { kind: 'info', info }
  const question = parseQuestionInput(body)
  if (question) return { kind: 'question', question }
  const translate = parseTranslateInput(body)
  if (translate) return { kind: 'translate', translate }
  const adapt = parseAdaptInput(body)
  if (adapt) return { kind: 'adapt', adapt }
  const ideaPatterns = parseIdeaPatternsInput(body)
  if (ideaPatterns) return { kind: 'ideaPatterns', ideaPatterns }
  const ideas = parseIdeasInput(body)
  if (ideas) return { kind: 'ideas', ideas }
  const label = parseLabelInput(body)
  return label ? { kind: 'label', label } : { kind: 'pattern', pattern: parseInput(body) }
}

/**
 * Patrons de Ravelry pour les idées qui n'en ont pas (gratuit) : filtrés par grosseur et métrage disponible (somme des
 * laines, si connue). Ravelry absent ou en erreur : idées sans patrons (la recherche web reste possible).
 */
async function withRavelryPatterns(ideas: YarnIdea[], weight: string | null, yarns: IdeaYarn[], deps: Deps): Promise<{ ideas: YarnIdea[]; ravelry: string }> {
  const ravelry = deps.ravelry ?? {}
  if (!ravelryConfigured(ravelry)) return { ideas, ravelry: 'absent' }
  const meters = yarns.every((y) => y.meters !== null) ? yarns.reduce((sum, y) => sum + y.meters!, 0) : null
  let error: string | null = null
  const enriched = await Promise.all(
    ideas.map(async (idea) => {
      if (idea.patterns.length > 0 || !idea.search) return idea
      try {
        return { ...idea, patterns: await searchRavelry({ search: idea.search, weight, meters }, ravelry) }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        return idea
      }
    }),
  )
  if (error) deps.log?.('ravelry en erreur', { error })
  return { ideas: enriched, ravelry: error ? 'erreur' : 'ok' }
}

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse,
    usesModel: (input) => input.kind !== 'link',
    async run(input, options) {
      if (input.kind === 'link') {
        const result = await readLink(input.link, { fetchPage: deps.fetchPage ?? fetch, resolveDns: deps.resolveDns })
        return { body: result, log: { link: true, pdf: result.pdf !== null, image: result.image !== null } }
      }
      if (input.kind === 'info') {
        const { info, usage } = await readPatternInfo(input.info, options)
        return { body: info, log: { info: true, pdf: input.info.pdf !== null, photos: input.info.photos.length, ...usage } }
      }
      if (input.kind === 'question') {
        const { answer, usage } = await answerQuestion(input.question, options)
        return { body: { answer }, log: { question: true, ...usage } }
      }
      if (input.kind === 'translate') {
        const { text, numbersKept, usage } = await translateStep(input.translate, options)
        return { body: { text, numbersKept }, log: { translate: true, chars: input.translate.text.length, numbersKept, ...usage } }
      }
      if (input.kind === 'adapt') {
        const { steps, usage } = await adaptPattern(input.adapt, options)
        return { body: { steps }, log: { adapt: true, steps: input.adapt.steps.length, changed: steps.length, ...usage } }
      }
      if (input.kind === 'ideas') {
        const { ideas: suggested, weight, searches, usage } = await suggestIdeas(input.ideas, options)
        const { ideas, ravelry } = await withRavelryPatterns(suggested, weight, input.ideas.yarns, deps)
        const log = { ideas: ideas.length, yarns: input.ideas.yarns.length, wish: input.ideas.wish !== '', patterns: ideas.reduce((n, i) => n + i.patterns.length, 0), searches, ravelry }
        return { body: { ideas, weight }, log: { ...log, ...usage } }
      }
      if (input.kind === 'ideaPatterns') {
        const { patterns, searches, usage } = await findIdeaPatterns(input.ideaPatterns, options)
        return { body: { patterns }, log: { ideaPatterns: true, patterns: patterns.length, searches, ...usage } }
      }
      if (input.kind === 'label') {
        const { yarn, usage } = await readYarnLabel(input.label, options)
        return { body: yarn, log: { label: true, kb: Math.round(input.label.label.length / 1365), ...usage } }
      }
      const { pattern, usage } = await readPattern(input.pattern, options)
      return { body: pattern, log: { steps: pattern.steps.length, kb: Math.round(input.pattern.pdf.length / 1365), ...usage } }
    },
    logs: { done: 'patron lu', refused: 'patron refusé', failed: 'patron en erreur' },
    failure: 'La lecture a échoué.',
  })
}

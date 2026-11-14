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
// POST { ideas: { yarn: description, meters, needle_mm } }   (idées de modèles pour une laine du stock)
//   → 200 { ideas: [{ title, why, meters, needleMm, search, patterns: [{ title, url }] }], weight }   (recherche web)
// POST { link: { url } }   (patron ajouté à la bibliothèque par un lien, sans le modèle)
//   → 200 { url, title, image: { data, type } | null, pdf: { data, name } | null }
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { adaptPattern, parseAdaptInput, type AdaptInput } from './adapt.ts'
import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { answerQuestion, parseQuestionInput, parseTranslateInput, translateStep, type QuestionInput, type TranslateInput } from './assist.ts'
import { parseInput, readPattern, type PatternInput } from './pattern.ts'
import { parseIdeasInput, suggestIdeas, type IdeasInput } from './ideas.ts'
import { parseLabelInput, readYarnLabel, type LabelInput } from './yarn.ts'
import { parseLinkInput, readLink, type LinkDeps, type LinkInput } from './link.ts'

/** `fetchPage`, `resolveDns` : lecture d'un lien (fetch global par défaut). */
export type Deps = ModelDeps & Partial<LinkDeps>

type Input =
  | { kind: 'pattern'; pattern: PatternInput }
  | { kind: 'label'; label: LabelInput }
  | { kind: 'ideas'; ideas: IdeasInput }
  | { kind: 'question'; question: QuestionInput }
  | { kind: 'translate'; translate: TranslateInput }
  | { kind: 'adapt'; adapt: AdaptInput }
  | { kind: 'link'; link: LinkInput }

function parse(body: unknown): Input {
  const link = parseLinkInput(body)
  if (link) return { kind: 'link', link }
  const question = parseQuestionInput(body)
  if (question) return { kind: 'question', question }
  const translate = parseTranslateInput(body)
  if (translate) return { kind: 'translate', translate }
  const adapt = parseAdaptInput(body)
  if (adapt) return { kind: 'adapt', adapt }
  const ideas = parseIdeasInput(body)
  if (ideas) return { kind: 'ideas', ideas }
  const label = parseLabelInput(body)
  return label ? { kind: 'label', label } : { kind: 'pattern', pattern: parseInput(body) }
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
        const { ideas, weight, searches, usage } = await suggestIdeas(input.ideas, options)
        return { body: { ideas, weight }, log: { ideas: ideas.length, patterns: ideas.reduce((n, i) => n + i.patterns.length, 0), searches, ...usage } }
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

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
// POST { ideas: { yarn: description, meters, needle_mm } }   (idées de modèles pour une laine du stock)
//   → 200 { ideas: [{ title, why, meters, needleMm, search, patterns: [{ title, url }] }], weight }   (recherche web)
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { answerQuestion, parseQuestionInput, parseTranslateInput, translateStep, type QuestionInput, type TranslateInput } from './assist.ts'
import { parseInput, readPattern, type PatternInput } from './pattern.ts'
import { parseIdeasInput, suggestIdeas, type IdeasInput } from './ideas.ts'
import { parseLabelInput, readYarnLabel, type LabelInput } from './yarn.ts'

export type Deps = ModelDeps

type Input =
  | { kind: 'pattern'; pattern: PatternInput }
  | { kind: 'label'; label: LabelInput }
  | { kind: 'ideas'; ideas: IdeasInput }
  | { kind: 'question'; question: QuestionInput }
  | { kind: 'translate'; translate: TranslateInput }

function parse(body: unknown): Input {
  const question = parseQuestionInput(body)
  if (question) return { kind: 'question', question }
  const translate = parseTranslateInput(body)
  if (translate) return { kind: 'translate', translate }
  const ideas = parseIdeasInput(body)
  if (ideas) return { kind: 'ideas', ideas }
  const label = parseLabelInput(body)
  return label ? { kind: 'label', label } : { kind: 'pattern', pattern: parseInput(body) }
}

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse,
    async run(input, options) {
      if (input.kind === 'question') {
        const { answer, usage } = await answerQuestion(input.question, options)
        return { body: { answer }, log: { question: true, ...usage } }
      }
      if (input.kind === 'translate') {
        const { text, numbersKept, usage } = await translateStep(input.translate, options)
        return { body: { text, numbersKept }, log: { translate: true, chars: input.translate.text.length, numbersKept, ...usage } }
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

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
// POST { ravelry_start: { redirect_uri } } → 200 { url }   (connexion d'un compte Ravelry, voir ravelryAuth.ts)
// POST { ravelry_finish: { code, state } } → 200 { username }
// POST { ravelry_yarns: { query } } → 200 { yarns: [{ id, brand, name, weightG, lengthM, category }] }   (laines de Ravelry)
// POST { ravelry_yarn: { id } } → 200 { yarn: { brand, name, composition, weight_g, length_m, needle_mm } }
//   (compte Ravelry relié, sinon 409 ; sans le modèle)
// POST { link: { url } }   (patron ajouté à la bibliothèque par un lien, sans le modèle)
//   → 200 { url, title, image: { data, type } | null, pdf: { data, name } | null, ravelry: { title, sizes, meters, needleMm, yarn } | null }
//   (ravelry : infos du patron par l'API de Ravelry, pour un lien de patron Ravelry et un compte relié)
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { adaptPattern, parseAdaptInput, type AdaptInput } from './adapt.ts'
import { HttpError } from '../_shared/anthropic.ts'
import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { answerQuestion, parseQuestionInput, parseTranslateInput, translateStep, type QuestionInput, type TranslateInput } from './assist.ts'
import { parseInput, readPattern, type PatternInput } from './pattern.ts'
import { findIdeaPatterns, parseIdeaPatternsInput, parseIdeasInput, suggestIdeas, type IdeaPatternsInput, type IdeasInput, type IdeaYarn, type YarnIdea } from './ideas.ts'
import { parseLabelInput, readYarnLabel, type LabelInput } from './yarn.ts'
import { parseInfoInput, readPatternInfo, type InfoInput } from './info.ts'
import { parseLinkInput, readLink, type LinkDeps, type LinkInput } from './link.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { getRavelryPattern, getRavelryYarn, RavelryError, ravelryPermalink, searchRavelry, searchRavelryYarns, type RavelryDeps, type RavelryPatternInfo } from './ravelry.ts'
import { accessTokenFor, finishRavelry, parseRavelryFinish, parseRavelryStart, startRavelry, type RavelryOAuth } from './ravelryAuth.ts'

/**
 * `fetchPage`, `resolveDns` : lecture d'un lien (fetch global par défaut). `ravelry` : connexion des comptes Ravelry et
 * patrons de Ravelry pour les idées (sans compte relié, pas de patrons Ravelry).
 */
export type Deps = ModelDeps & Partial<LinkDeps> & { ravelry?: RavelryOAuth }

type Input =
  | { kind: 'pattern'; pattern: PatternInput }
  | { kind: 'label'; label: LabelInput }
  | { kind: 'ideas'; ideas: IdeasInput }
  | { kind: 'ideaPatterns'; ideaPatterns: IdeaPatternsInput }
  | { kind: 'question'; question: QuestionInput }
  | { kind: 'translate'; translate: TranslateInput }
  | { kind: 'adapt'; adapt: AdaptInput }
  | { kind: 'link'; link: LinkInput }
  | { kind: 'ravelryStart'; ravelryStart: { redirectUri: string } }
  | { kind: 'ravelryFinish'; ravelryFinish: { code: string; state: string } }
  | { kind: 'ravelryYarns'; query: string }
  | { kind: 'ravelryYarn'; id: number }
  | { kind: 'info'; info: InfoInput }

/** Demandes qui n'utilisent pas le modèle (ni budget ni clé vérifiés). */
const WITHOUT_MODEL: Input['kind'][] = ['link', 'ravelryStart', 'ravelryFinish', 'ravelryYarns', 'ravelryYarn']

function parse(body: unknown): Input {
  const data = asRecord(body)
  if ('ravelry_yarns' in data) {
    const query = asRecord(data.ravelry_yarns).query
    if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new HttpError('Tape le nom de la laine.', 400)
    return { kind: 'ravelryYarns', query: query.trim() }
  }
  if ('ravelry_yarn' in data) {
    const id = asRecord(data.ravelry_yarn).id
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new HttpError('Laine inconnue.', 400)
    return { kind: 'ravelryYarn', id }
  }
  const ravelryStart = parseRavelryStart(body)
  if (ravelryStart) return { kind: 'ravelryStart', ravelryStart }
  const ravelryFinish = parseRavelryFinish(body)
  if (ravelryFinish) return { kind: 'ravelryFinish', ravelryFinish }
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
async function withRavelryPatterns(ideas: YarnIdea[], weight: string | null, yarns: IdeaYarn[], deps: Deps, userId: string | null): Promise<{ ideas: YarnIdea[]; ravelry: string }> {
  let accessToken: string | null
  try {
    accessToken = await accessTokenFor(userId, deps.ravelry)
  } catch (e) {
    deps.log?.('ravelry en erreur', { error: e instanceof Error ? e.message : String(e) })
    return { ideas, ravelry: 'erreur' }
  }
  if (!accessToken) return { ideas, ravelry: 'absent' }
  const ravelry = { fetchRavelry: deps.ravelry!.fetch, accessToken }
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

/** Accès à l'API de Ravelry au nom de la personne ; 409 si son compte n'est pas relié. */
async function ravelryAccess(deps: Deps, userId: string | null): Promise<RavelryDeps> {
  const accessToken = await accessTokenFor(userId, deps.ravelry)
  if (!accessToken) throw new HttpError('Relie ton compte Ravelry dans les Réglages pour chercher une laine.', 409)
  return { fetchRavelry: deps.ravelry!.fetch, accessToken }
}

/** Infos d'un patron Ravelry (lien de patron, compte relié) ; null sinon, ou si Ravelry ne répond pas. */
async function ravelryInfo(url: string, deps: Deps, userId: string | null): Promise<RavelryPatternInfo | null> {
  const permalink = ravelryPermalink(url)
  if (!permalink) return null
  try {
    const accessToken = await accessTokenFor(userId, deps.ravelry)
    return accessToken ? await getRavelryPattern(permalink, { fetchRavelry: deps.ravelry!.fetch, accessToken }) : null
  } catch (e) {
    deps.log?.('ravelry en erreur', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse,
    usesModel: (input) => !WITHOUT_MODEL.includes(input.kind),
    async run(input, options, _deps, { userId }) {
      if (input.kind === 'ravelryYarns' || input.kind === 'ravelryYarn') {
        const ravelry = await ravelryAccess(deps, userId)
        try {
          if (input.kind === 'ravelryYarns') {
            const yarns = await searchRavelryYarns(input.query, ravelry)
            return { body: { yarns }, log: { ravelryYarns: yarns.length } }
          }
          return { body: { yarn: await getRavelryYarn(input.id, ravelry) }, log: { ravelryYarn: true } }
        } catch (e) {
          if (e instanceof RavelryError) throw new HttpError(e.message, 502)
          throw e
        }
      }
      if (input.kind === 'ravelryStart' || input.kind === 'ravelryFinish') {
        if (!userId) throw new HttpError('Connexion requise.', 401)
        if (input.kind === 'ravelryStart') return { body: await startRavelry(input.ravelryStart, userId, deps.ravelry), log: { ravelryStart: true } }
        const { username } = await finishRavelry(input.ravelryFinish, userId, deps.ravelry)
        return { body: { username }, log: { ravelryFinish: true } }
      }
      if (input.kind === 'link') {
        const [page, ravelry] = await Promise.all([
          readLink(input.link, { fetchPage: deps.fetchPage ?? fetch, resolveDns: deps.resolveDns }).catch((e: unknown) => e),
          ravelryInfo(input.link.url, deps, userId),
        ])
        // Page illisible : avec les infos de Ravelry, le lien est gardé quand même.
        if (page instanceof Error && !ravelry) throw page
        const result = page instanceof Error ? { url: input.link.url, title: ravelry!.title, image: null, pdf: null } : (page as Awaited<ReturnType<typeof readLink>>)
        return { body: { ...result, ravelry }, log: { link: true, pdf: result.pdf !== null, image: result.image !== null, ravelry: ravelry !== null } }
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
        const { ideas, ravelry } = await withRavelryPatterns(suggested, weight, input.ideas.yarns, deps, userId)
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

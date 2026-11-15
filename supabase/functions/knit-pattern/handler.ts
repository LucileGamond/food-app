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
// POST { ravelry_imports: {} } → 200 { patterns: [{ patternId, title, author, photoUrl, sources, volumeId, hasPdf }] }
//   (favoris et bibliothèque Ravelry de la personne)
// POST { ravelry_import: { pattern_id, volume_id } }
//   → 200 { url, title, author, ravelry: infos, image: { data, type } | null, pdf: { data, name } | null, pdfMissing }
//   (compte Ravelry relié, sinon 409 ; sans le modèle)
// POST { link: { url } }   (patron ajouté à la bibliothèque par un lien, sans le modèle)
//   → 200 { url, title, image: { data, type } | null, pdf: { data, name } | null, ravelry: { title, sizes, meters, needleMm, yarn } | null }
//   (ravelry : infos du patron par l'API de Ravelry, pour un lien de patron Ravelry et un compte relié)
//   → 4xx/5xx { error: message lisible }
// Comme estimate-nutrition : verify_jwt, plus `isSignedIn` pour refuser la clé publique anonyme.

import { adaptPattern, parseAdaptInput, type AdaptInput } from './adapt.ts'
import { HttpError, type ModelOptions } from '../_shared/anthropic.ts'
import { createModelHandler, type ModelDeps } from '../_shared/handler.ts'
import { answerQuestion, parseQuestionInput, parseTranslateInput, translateStep, type QuestionInput, type TranslateInput } from './assist.ts'
import { parseInput, readPattern, type PatternInput } from './pattern.ts'
import { findIdeaPatterns, parseIdeaPatternsInput, parseIdeasInput, suggestIdeas, type IdeaPatternsInput, type IdeasInput, type IdeaYarn, type YarnIdea } from './ideas.ts'
import { parseLabelInput, readYarnLabel, type LabelInput } from './yarn.ts'
import { parseInfoInput, readPatternInfo, type InfoInput } from './info.ts'
import { parseLinkInput, readLink, type LinkDeps, type LinkInput } from './link.ts'
import { asRecord } from '../_shared/sanitize.ts'
import { download, toBase64 } from '../_shared/download.ts'
import {
  getRavelryPattern,
  getRavelryYarn,
  importRavelryPattern,
  listRavelryImports,
  RavelryError,
  ravelryPermalink,
  searchRavelry,
  searchRavelryYarns,
  type RavelryDeps,
  type RavelryPatternInfo,
} from './ravelry.ts'
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
  | { kind: 'ravelryImports' }
  | { kind: 'ravelryImport'; patternId: number; volumeId: number | null }
  | { kind: 'info'; info: InfoInput }

/** Demandes qui n'utilisent pas le modèle (ni budget ni clé vérifiés). */
const WITHOUT_MODEL: Input['kind'][] = ['link', 'ravelryStart', 'ravelryFinish', 'ravelryYarns', 'ravelryYarn', 'ravelryImports', 'ravelryImport']

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

/** PDF importé de Ravelry : 20 Mo au plus, comme ceux envoyés depuis le téléphone. */
const MAX_IMPORT_PDF_BYTES = 20 * 1024 * 1024
const MAX_IMPORT_IMAGE_BYTES = 3_000_000
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Fichier de Ravelry (photo, PDF) ; null s'il ne se télécharge pas ou n'est pas du bon type. */
async function fetchFile(url: string | null, accept: string[], maxBytes: number, deps: Deps): Promise<{ data: string; type: string } | null> {
  if (!url) return null
  try {
    const file = await download(url, accept.join(','), maxBytes, deps.fetchPage ?? fetch, deps.resolveDns)
    const type = file.type.split(';')[0]!.trim().toLowerCase()
    const isPdf = accept.includes('application/pdf') && new TextDecoder('latin1').decode(file.bytes.subarray(0, 5)) === '%PDF-'
    return file.bytes.length > 0 && (isPdf || accept.includes(type)) ? { data: toBase64(file.bytes), type: isPdf ? 'application/pdf' : type } : null
  } catch {
    return null
  }
}

function parse(body: unknown): Input {
  const data = asRecord(body)
  if ('ravelry_yarns' in data) {
    const query = asRecord(data.ravelry_yarns).query
    if (typeof query !== 'string' || !query.trim() || query.length > 100) throw new HttpError('Tape le nom de la laine.', 400)
    return { kind: 'ravelryYarns', query: query.trim() }
  }
  if ('ravelry_imports' in data) return { kind: 'ravelryImports' }
  if ('ravelry_import' in data) {
    const request = asRecord(data.ravelry_import)
    if (!isId(request.pattern_id) || (request.volume_id != null && !isId(request.volume_id))) throw new HttpError('Patron inconnu.', 400)
    return { kind: 'ravelryImport', patternId: request.pattern_id, volumeId: isId(request.volume_id) ? request.volume_id : null }
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
  if (!accessToken) throw new HttpError('Relie d’abord ton compte Ravelry dans les Réglages.', 409)
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

type Run = { body: unknown; log: Record<string, unknown> }
type Runner<K extends Input['kind']> = (input: Extract<Input, { kind: K }>, options: ModelOptions, deps: Deps, userId: string | null) => Promise<Run>

/** Connexion Ravelry : réservée à une personne connectée (le compte est rangé sous son identifiant). */
function signedIn(userId: string | null): string {
  if (!userId) throw new HttpError('Connexion requise.', 401)
  return userId
}

/** Appel à l'API de Ravelry avec le compte relié ; une erreur de Ravelry devient un 502 lisible. */
async function withRavelry(deps: Deps, userId: string | null, call: (ravelry: RavelryDeps) => Promise<Run>): Promise<Run> {
  const ravelry = await ravelryAccess(deps, userId)
  try {
    return await call(ravelry)
  } catch (e) {
    if (e instanceof RavelryError) throw new HttpError(e.message, 502)
    throw e
  }
}

/** Traitement de chaque genre de requête : réponse et données du journal. */
const RUNNERS: { [K in Input['kind']]: Runner<K> } = {
  ravelryImports: (_input, _options, deps, userId) =>
    withRavelry(deps, userId, async (ravelry) => {
      const patterns = await listRavelryImports(ravelry)
      return { body: { patterns }, log: { ravelryImports: patterns.length } }
    }),
  ravelryImport: ({ patternId, volumeId }, _options, deps, userId) =>
    withRavelry(deps, userId, async (ravelry) => {
      const found = await importRavelryPattern(patternId, volumeId, ravelry)
      const [image, pdf] = await Promise.all([
        fetchFile(found.photoUrl, IMAGE_TYPES, MAX_IMPORT_IMAGE_BYTES, deps),
        found.pdf ? fetchFile(found.pdf.url, ['application/pdf'], MAX_IMPORT_PDF_BYTES, deps) : Promise.resolve(null),
      ])
      const pdfMissing = found.pdf && !pdf ? 'erreur' : found.pdfMissing
      const body = { url: found.url, title: found.title, author: found.author, ravelry: found.info, image, pdf: pdf && found.pdf ? { data: pdf.data, name: found.pdf.name } : null, pdfMissing }
      return { body, log: { ravelryImport: true, image: image !== null, pdf: pdf !== null, pdfMissing } }
    }),
  ravelryYarns: ({ query }, _options, deps, userId) =>
    withRavelry(deps, userId, async (ravelry) => {
      const yarns = await searchRavelryYarns(query, ravelry)
      return { body: { yarns }, log: { ravelryYarns: yarns.length } }
    }),
  ravelryYarn: ({ id }, _options, deps, userId) => withRavelry(deps, userId, async (ravelry) => ({ body: { yarn: await getRavelryYarn(id, ravelry) }, log: { ravelryYarn: true } })),
  async ravelryStart({ ravelryStart }, _options, deps, userId) {
    return { body: await startRavelry(ravelryStart, signedIn(userId), deps.ravelry), log: { ravelryStart: true } }
  },
  async ravelryFinish({ ravelryFinish }, _options, deps, userId) {
    const { username } = await finishRavelry(ravelryFinish, signedIn(userId), deps.ravelry)
    return { body: { username }, log: { ravelryFinish: true } }
  },
  async link({ link }, _options, deps, userId) {
    const [page, ravelry] = await Promise.all([
      readLink(link, { fetchPage: deps.fetchPage ?? fetch, resolveDns: deps.resolveDns }).catch((e: unknown) => e),
      ravelryInfo(link.url, deps, userId),
    ])
    // Page illisible : avec les infos de Ravelry, le lien est gardé quand même.
    if (page instanceof Error && !ravelry) throw page
    const result = page instanceof Error ? { url: link.url, title: ravelry!.title, image: null, pdf: null } : (page as Awaited<ReturnType<typeof readLink>>)
    return { body: { ...result, ravelry }, log: { link: true, pdf: result.pdf !== null, image: result.image !== null, ravelry: ravelry !== null } }
  },
  async info({ info: input }, options) {
    const { info, usage } = await readPatternInfo(input, options)
    return { body: info, log: { info: true, pdf: input.pdf !== null, photos: input.photos.length, ...usage } }
  },
  async question({ question }, options) {
    const { answer, usage } = await answerQuestion(question, options)
    return { body: { answer }, log: { question: true, ...usage } }
  },
  async translate({ translate }, options) {
    const { text, numbersKept, usage } = await translateStep(translate, options)
    return { body: { text, numbersKept }, log: { translate: true, chars: translate.text.length, numbersKept, ...usage } }
  },
  async adapt({ adapt }, options) {
    const { steps, usage } = await adaptPattern(adapt, options)
    return { body: { steps }, log: { adapt: true, steps: adapt.steps.length, changed: steps.length, ...usage } }
  },
  async ideas({ ideas: input }, options, deps, userId) {
    const { ideas: suggested, weight, searches, usage } = await suggestIdeas(input, options)
    const { ideas, ravelry } = await withRavelryPatterns(suggested, weight, input.yarns, deps, userId)
    const log = { ideas: ideas.length, yarns: input.yarns.length, wish: input.wish !== '', patterns: ideas.reduce((n, i) => n + i.patterns.length, 0), searches, ravelry }
    return { body: { ideas, weight }, log: { ...log, ...usage } }
  },
  async ideaPatterns({ ideaPatterns }, options) {
    const { patterns, searches, usage } = await findIdeaPatterns(ideaPatterns, options)
    return { body: { patterns }, log: { ideaPatterns: true, patterns: patterns.length, searches, ...usage } }
  },
  async label({ label }, options) {
    const { yarn, usage } = await readYarnLabel(label, options)
    return { body: yarn, log: { label: true, kb: Math.round(label.label.length / 1365), ...usage } }
  },
  async pattern({ pattern: input }, options) {
    const { pattern, usage } = await readPattern(input, options)
    return { body: pattern, log: { steps: pattern.steps.length, kb: Math.round(input.pdf.length / 1365), ...usage } }
  },
}

export function createHandler(deps: Deps) {
  return createModelHandler(deps, {
    parse,
    usesModel: (input) => !WITHOUT_MODEL.includes(input.kind),
    run: (input, options, _deps, { userId }) => (RUNNERS[input.kind] as Runner<Input['kind']>)(input, options, deps, userId),
    logs: { done: 'patron lu', refused: 'patron refusé', failed: 'patron en erreur' },
    failure: 'La lecture a échoué.',
  })
}

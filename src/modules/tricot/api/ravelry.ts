// Ravelry : compte relié, recherche de laines, import de patrons (gratuit, par la fonction knit-pattern).

import { toAppError } from '@/api/errors'
import { yarnFromJson, type RavelryYarnHit, type Yarn } from '../lib/yarn'
import { hasList, hasObject, hasText, isRavelryImport } from '../lib/ravelry'
import { patternLinkFromResponse, type PatternInfo, type PatternLinkResponse, type RavelryImported, type RavelryImportItem } from '../lib/library'
import { READ_TIMEOUT_MS, type KnitContext } from './shared'

export function ravelryApi({ db, invokeKnit, requireUserId }: KnitContext) {
  return {
    /** Compte Ravelry relié (nom), ou null : sans lui, les idées n'ont pas de patrons Ravelry. */
    async getRavelryAccount(): Promise<{ username: string } | null> {
      const { data, error } = await db.from('ravelry_accounts').select('username').maybeSingle()
      if (error) throw toAppError(error, 'Impossible de savoir si Ravelry est relié.')
      return data ? { username: data.username } : null
    },

    /** Début de la connexion à Ravelry : adresse d'autorisation où aller, retour sur `redirectUri`. */
    async startRavelryConnect(redirectUri: string): Promise<string> {
      const { url } = await invokeKnit<{ url: string }>({ ravelry_start: { redirect_uri: redirectUri } }, 'Impossible de se connecter à Ravelry.', hasText('url'))
      return url
    },

    /** Retour de Ravelry : relie le compte ; renvoie son nom. */
    async finishRavelryConnect(code: string, state: string): Promise<string> {
      const { username } = await invokeKnit<{ username: string }>({ ravelry_finish: { code, state } }, 'Impossible de relier le compte Ravelry.', hasText('username'))
      return username
    },

    /** Laines de Ravelry pour une recherche (« drops merino ») : compte Ravelry relié, gratuit. */
    async searchRavelryYarns(query: string): Promise<RavelryYarnHit[]> {
      const { yarns } = await invokeKnit<{ yarns: RavelryYarnHit[] }>({ ravelry_yarns: { query } }, 'La recherche sur Ravelry a échoué.', hasList('yarns'))
      return yarns
    },

    /** Laine de Ravelry dans les champs d'une laine (marque, nom, composition, poids, métrage, aiguilles). */
    async getRavelryYarn(id: number): Promise<Yarn> {
      const { yarn } = await invokeKnit<{ yarn: Partial<Yarn> }>({ ravelry_yarn: { id } }, 'Impossible de lire cette laine sur Ravelry.', hasObject('yarn'))
      return yarnFromJson(yarn)
    },

    /** Patrons à importer de Ravelry : favoris et bibliothèque du compte relié (gratuit). */
    async listRavelryImports(): Promise<RavelryImportItem[]> {
      const { patterns } = await invokeKnit<{ patterns: RavelryImportItem[] }>({ ravelry_imports: {} }, 'Impossible de lire tes patrons Ravelry.', hasList('patterns'))
      return patterns
    },

    /** Un patron de Ravelry : infos, photo et PDF de la bibliothèque (si Ravelry le permet). */
    async importRavelryPattern(item: Pick<RavelryImportItem, 'patternId' | 'volumeId'>): Promise<RavelryImported> {
      const read = await invokeKnit<PatternLinkResponse & { author: string | null; ravelry: PatternInfo; pdfMissing: RavelryImported['pdfMissing'] }>(
        { ravelry_import: { pattern_id: item.patternId, volume_id: item.volumeId } },
        'Impossible d’importer ce patron de Ravelry.',
        isRavelryImport,
        READ_TIMEOUT_MS,
      )
      const link = patternLinkFromResponse(read)
      // Champs garantis par la fonction (isRavelryImport, puis réponse toujours complète).
      return { url: read.url, title: read.title as string, author: read.author, info: read.ravelry, image: link.image, pdf: link.pdf, pdfMissing: read.pdfMissing }
    },

    /** Délie le compte Ravelry (ses jetons sont supprimés avec lui). */
    async disconnectRavelry(): Promise<void> {
      const { error } = await db.from('ravelry_accounts').delete().eq('profile_id', await requireUserId())
      if (error) throw toAppError(error, 'Impossible de délier le compte Ravelry.')
    },
  }
}

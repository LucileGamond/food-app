// Renvois entre recettes d'un même livre (« pâte sucrée, voir p. 208 ») : références de page, sous-recettes à lier.

import { capitalize } from '../text'
import type { Ingredient } from './model'

const PAGE_REFERENCE = /\b(?:voir\s+)?(?:p\.|page)\s*(\d+)/i

/** Renvoi à une autre page du livre (« voir p. 208 ») dans le nom ou la précision : « p. 208 », sinon null. */
export function pageReference(ingredient: Pick<Ingredient, 'name' | 'note'>): string | null {
  const match = PAGE_REFERENCE.exec(`${ingredient.name} ${ingredient.note ?? ''}`)
  return match ? `p. ${match[1]}` : null
}

/** Sous-recette à importer ou à lier : ingrédient qui renvoie à une autre page, pas encore lié. */
export interface PendingLink {
  /** Position de l'ingrédient dans la recette. */
  position: number
  name: string
  page: string
}

export function pendingLinks(ingredients: readonly Ingredient[]): PendingLink[] {
  return ingredients.flatMap((ingredient, position) => {
    const page = ingredient.linkedRecipe ? null : pageReference(ingredient)
    return page ? [{ position, name: ingredient.name, page }] : []
  })
}

/** Source d'une sous-recette : celle de la recette principale, à la page indiquée (« Pâtisserie maison, p. 208 »). */
export function linkedSource(parentSource: string | null | undefined, page: string): { source: string; page: string } {
  return { source: parentSource?.trim() ?? '', page: page.replace(/^p\.\s*/i, '') }
}

const SOURCE_WITH_PAGE = /^(.*?)\b(?:p\.|pp\.|pages?)\s*(\d+(?:\s*[-–]\s*\d+)?)$/i

/** « Pâtisserie maison, p. 146 » → livre et page ; null si le texte ne finit pas par une page (comme split_source en base). */
export function splitSource(text: string): { source: string; page: string } | null {
  const match = SOURCE_WITH_PAGE.exec(text.trim())
  if (!match) return null
  return { source: match[1]!.replace(/[\s,;–-]+$/, '').trim(), page: match[2]! }
}

/** Formulaire de nouvelle recette pour importer la sous-recette d'un ingrédient. */
export function linkedImportPath(parentId: string, reference: PendingLink): string {
  const params = new URLSearchParams({ lier: parentId, ingredient: String(reference.position), nom: reference.name, page: reference.page })
  return `/recettes/nouvelle?${params}`
}

/** Paramètres d'un formulaire ouvert par `linkedImportPath`, ou null. */
export function parseLinkedImport(params: URLSearchParams): { parentId: string; reference: PendingLink } | null {
  const parentId = params.get('lier') ?? ''
  const position = params.get('ingredient') ? Number(params.get('ingredient')) : Number.NaN
  const name = params.get('nom')?.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId) || !Number.isInteger(position) || position < 0 || !name) return null
  return { parentId, reference: { position, name, page: params.get('page')?.trim() ?? '' } }
}

/** Titre proposé pour une sous-recette à partir du nom de l'ingrédient (« pâte sucrée » → « Pâte sucrée »). */
export function linkedTitle(name: string): string {
  return capitalize(name.trim())
}

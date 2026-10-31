import type { Api } from '@/api'
import { pageReference } from './recipes'
import { normalizeName } from './shopping'

// Liens automatiques entre recettes d'un même livre : un ingrédient qui renvoie à une page (« pâte sucrée, voir
// p. 208 ») est lié à la recette de ce livre imprimée à cette page.

export interface LinkableRecipe {
  id: string
  title: string
  source: string | null
  sourcePage: string | null
  ingredients: { position: number; name: string; note: string | null; linkedRecipeId: string | null }[]
}

export interface AutoLink {
  recipeId: string
  recipeTitle: string
  position: number
  name: string
  linkedId: string
  linkedTitle: string
}

/** Pages d'une recette : « 146 » → [146, 146], « 146-147 » → [146, 147] ; null si illisible. */
function pageRange(page: string | null): [number, number] | null {
  const match = page ? /(\d+)(?:\s*[-–]\s*(\d+))?/.exec(page) : null
  if (!match) return null
  const first = Number(match[1])
  const last = match[2] ? Number(match[2]) : first
  return last >= first ? [first, last] : [first, first]
}

/** Nom de l'ingrédient sans le renvoi ni les parenthèses : « pâte sucrée (voir p. 208) » → « pate sucree ». */
function bareName(name: string): string {
  return normalizeName(name.replace(/\([^)]*\)/g, ' ').replace(/\b(?:voir\s+)?(?:p\.|page)\s*\d+.*/i, ' '))
}

/** Le titre et le nom de l'ingrédient se recouvrent (« Pâte sucrée » / « 1 pâte sucrée maison »). */
function sameDish(title: string, ingredient: string): boolean {
  const a = normalizeName(title)
  const b = bareName(ingredient)
  return a !== '' && b !== '' && (a.includes(b) || b.includes(a))
}

/**
 * Liens à créer : pour chaque ingrédient non lié qui renvoie à une page, la recette du même livre (casse et
 * accents près) imprimée à cette page. Plusieurs recettes sur la page : celle dont le titre correspond à
 * l'ingrédient, sinon rien (pas de lien au hasard). Avec `onlyFor`, seulement les liens qui touchent cette recette
 * (ses renvois, et ceux des autres recettes vers elle).
 */
export function findAutoLinks(recipes: readonly LinkableRecipe[], onlyFor?: string): AutoLink[] {
  const byBook = new Map<string, LinkableRecipe[]>()
  for (const recipe of recipes) {
    if (!recipe.source) continue
    const book = normalizeName(recipe.source)
    byBook.set(book, [...(byBook.get(book) ?? []), recipe])
  }

  const links: AutoLink[] = []
  for (const recipe of recipes) {
    if (!recipe.source) continue
    const sameBook = byBook.get(normalizeName(recipe.source)) ?? []
    for (const ingredient of recipe.ingredients) {
      if (ingredient.linkedRecipeId) continue
      const reference = pageReference(ingredient)
      if (!reference) continue
      const page = Number(reference.replace(/\D/g, ''))
      const onPage = sameBook.filter((other) => {
        const range = other.id !== recipe.id ? pageRange(other.sourcePage) : null
        return range !== null && page >= range[0] && page <= range[1]
      })
      const matching = onPage.length === 1 ? onPage : onPage.filter((other) => sameDish(other.title, ingredient.name))
      if (matching.length !== 1) continue
      const linked = matching[0]!
      if (onlyFor && recipe.id !== onlyFor && linked.id !== onlyFor) continue
      links.push({ recipeId: recipe.id, recipeTitle: recipe.title, position: ingredient.position, name: ingredient.name, linkedId: linked.id, linkedTitle: linked.title })
    }
  }
  return links
}

export interface AutoLinkResult {
  linked: AutoLink[]
  /** Liens qui n'ont pas pu être enregistrés (recette modifiée ou supprimée entre-temps…). */
  failed: number
}

/** Crée les liens automatiques (tous, ou ceux qui touchent `onlyFor`). Un lien en échec n'arrête pas les autres. */
export async function applyAutoLinks(api: Pick<Api, 'recipes'>, onlyFor?: string): Promise<AutoLinkResult> {
  const links = findAutoLinks(await api.recipes.listLinkable(), onlyFor)
  const linked: AutoLink[] = []
  let failed = 0
  for (const link of links) {
    try {
      await api.recipes.linkIngredient(link.recipeId, { position: link.position, name: link.name }, link.linkedId)
      linked.push(link)
    } catch {
      failed += 1
    }
  }
  return { linked, failed }
}

/** « « Tarte au citron » renvoie maintenant à « Pâte sucrée » », ou « 3 liens créés entre recettes ». */
export function autoLinkMessage(links: readonly AutoLink[]): string {
  if (links.length === 1) return `« ${links[0]!.recipeTitle} » renvoie maintenant à « ${links[0]!.linkedTitle} »`
  return `${links.length} liens créés entre recettes`
}

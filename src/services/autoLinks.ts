// Liens automatiques entre recettes d'un même livre : enregistrement des liens trouvés (voir lib/autoLinks).

import type { Api } from '@/api'
import { findAutoLinks, type AutoLink } from '@/lib/autoLinks'

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

import type { InboxItem } from './inbox'
import type { SkippedEntry } from './shoppingFromPlan'

/** Ce qu'un écran passe au suivant (`navigate(…, { state })`) ; absent après un rechargement de la page. */
export interface NavState {
  /** Où revenir : après la connexion, ou en quittant le formulaire de recette. */
  from?: string
  /** Formulaire de recette ouvert depuis un partage : lien à préremplir. */
  importUrl?: string
  /** Formulaire de recette ouvert depuis « À planifier » / « De côté » : l'élément à enregistrer. */
  fromInbox?: InboxItem
  /** Fiche d'une recette qui vient d'être enregistrée : proposer de lier les recettes auxquelles elle renvoie. */
  offerLinks?: boolean
  /** Ajout d'un patron de tricot ouvert depuis un partage : lien à lire. */
  patternLink?: { url: string; title: string | null }
  /** Liste de courses qui vient d'être générée : ce qui n'a pas pu y être ajouté. */
  skipped?: SkippedEntry[]
}

/** État reçu de l'écran précédent (vide s'il n'y en a pas). */
export function navState(location: { state: unknown }): NavState {
  return (location.state as NavState | null) ?? {}
}

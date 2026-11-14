/**
 * Zone tactile agrandie à 44 px sans changer le dessin : un pseudo-élément déborde de 8 px de chaque côté d'un bouton
 * de 28 px (pastille, petite icône). L'élément doit être positionné (`relative`, ou déjà `absolute`).
 */
export const TOUCH_AREA = "after:absolute after:-inset-2 after:content-['']"

/** Même chose pour un lien dans une ligne de texte (≈ 20 px de haut) : 12 px en plus au-dessus et en dessous. */
export const TOUCH_AREA_INLINE = "after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"

// Nettoyage de ce que renvoient le modèle ou l'application, commun aux lectures de knit-pattern.

/** Texte sans espaces autour, coupé à `max` caractères ; '' si ce n'est pas du texte. */
export function trimmedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

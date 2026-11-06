// Lecture prudente des données reçues (navigateur) ou renvoyées par le modèle : jamais de confiance, toujours bornées.

/** Texte nettoyé (espaces simplifiés) et tronqué ; '' si ce n'est pas du texte. */
export const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Objet dont on lit les champs ; {} si ce n'en est pas un. */
export const asRecord = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>

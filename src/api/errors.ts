/** Erreur affichable telle quelle à l'utilisateur. */
export class AppError extends Error {
  readonly code: string | undefined

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

/** Une recette sauvegardée ne peut pas être supprimée tant qu'un repas l'utilise. */
export class RecipeInUseError extends AppError {
  constructor(usedBy: 'planning' | 'recipe' = 'planning') {
    super(
      usedBy === 'recipe'
        ? 'Cette recette est utilisée dans une autre recette : elle ne peut pas être supprimée.'
        : 'Cette recette est utilisée dans le planning : elle ne peut pas être supprimée.',
      '23503',
    )
    this.name = 'RecipeInUseError'
  }
}

/** Le lien est déjà celui d'une autre recette sauvegardée. */
export class DuplicateRecipeUrlError extends AppError {
  readonly existing: { id: string; title: string }

  constructor(existing: { id: string; title: string }) {
    super(`Cette recette est déjà enregistrée : « ${existing.title} ».`, '23505')
    this.name = 'DuplicateRecipeUrlError'
    this.existing = existing
  }
}

interface PostgrestLikeError {
  code?: string
  message?: string
}

const MESSAGES: Record<string, string> = {
  '23503': 'Donnée liée introuvable ou encore utilisée.',
  '23514': 'Certaines valeurs sont invalides.',
  '22023': 'Certaines valeurs sont invalides.',
  P0002: 'Élément introuvable : il a peut-être été supprimé entre-temps.',
  '42501': "Tu n'as pas accès à cette donnée. Reconnecte-toi.",
  PGRST301: 'Ta session a expiré. Reconnecte-toi.',
}

/** Convertit une erreur Supabase en message clair. */
export function toAppError(error: PostgrestLikeError | null | undefined, fallback = 'Une erreur est survenue.'): AppError {
  if (error instanceof AppError) return error
  const code = error?.code
  if (code && MESSAGES[code]) return new AppError(MESSAGES[code], code)
  if (error?.message && /fetch|network/i.test(error.message)) {
    return new AppError('Connexion impossible. Vérifie ta connexion internet.', 'network')
  }
  return new AppError(fallback, code)
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message
  return 'Une erreur est survenue.'
}

/**
 * Erreur renvoyée par une Edge Function (import-recipe, suggest-meals) → message affichable. `prefix` préfixe le code
 * (« import-401 »).
 */
export async function functionError(error: { name?: string; context?: unknown }, fallback: string, prefix: string): Promise<AppError> {
  const response = error.context instanceof Response ? error.context : null
  if (!response) return new AppError('Connexion impossible. Vérifie ta connexion internet.', 'network')
  if (response.status === 401) return new AppError('Ta session a expiré. Reconnecte-toi.', `${prefix}-401`)
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  if (typeof body?.error === 'string') return new AppError(body.error, `${prefix}-${response.status}`)
  // Réponse sans message (passerelle) : taille refusée, ou service momentanément indisponible.
  if (response.status === 413) return new AppError('Photos trop lourdes : essaie avec une seule page, ou une photo plus petite.', `${prefix}-413`)
  if (response.status >= 500) return new AppError('Le service d’analyse ne répond pas. Réessaie dans un instant.', `${prefix}-${response.status}`)
  return new AppError(fallback, `${prefix}-${response.status}`)
}

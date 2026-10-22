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
  constructor() {
    super('Cette recette est utilisée dans le planning : elle ne peut pas être supprimée.', '23503')
    this.name = 'RecipeInUseError'
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

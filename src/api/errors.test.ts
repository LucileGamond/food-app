import { AppError, RecipeInUseError, errorMessage, functionError, toAppError } from './errors'

describe('toAppError', () => {
  it('traduit les codes connus', () => {
    expect(toAppError({ code: '23514' }).message).toBe('Certaines valeurs sont invalides.')
    expect(toAppError({ code: 'P0002' }).code).toBe('P0002')
    expect(toAppError({ code: '42501', message: 'permission denied' }).message).toMatch(/accès/)
  })
  it('détecte les erreurs réseau', () => {
    expect(toAppError({ message: 'TypeError: Failed to fetch' }).code).toBe('network')
  })
  it('utilise le message par défaut sinon', () => {
    expect(toAppError({ code: 'XX000', message: 'boom' }, 'Oups').message).toBe('Oups')
    expect(toAppError(null).message).toBe('Une erreur est survenue.')
  })
  it('renvoie telle quelle une AppError', () => {
    const error = new RecipeInUseError()
    expect(toAppError(error)).toBe(error)
    expect(error).toBeInstanceOf(AppError)
    expect(error.message).toContain('planning')
    expect(new RecipeInUseError('recipe').message).toBe('Cette recette est utilisée dans une autre recette : elle ne peut pas être supprimée.')
  })
})

describe('errorMessage', () => {
  it('donne le message d’une AppError ou un message générique', () => {
    expect(errorMessage(new AppError('Précis'))).toBe('Précis')
    expect(errorMessage(new Error('technique'))).toBe('Une erreur est survenue.')
    expect(errorMessage('x')).toBe('Une erreur est survenue.')
  })
})

describe('functionError', () => {
  const failed = (status: number, body: unknown = {}) => ({ context: new Response(JSON.stringify(body), { status }) })

  it('reprend le message de la fonction, avec le code préfixé', async () => {
    expect(await functionError(failed(502, { error: 'Pas assez d’idées trouvées : réessaie.' }), 'Échec.', 'ideas')).toMatchObject({
      message: 'Pas assez d’idées trouvées : réessaie.',
      code: 'ideas-502',
    })
  })

  it('traduit les réponses sans message', async () => {
    expect(await functionError({}, 'Échec.', 'ideas')).toMatchObject({ code: 'network', message: 'Connexion impossible. Vérifie ta connexion internet.' })
    expect(await functionError(failed(401), 'Échec.', 'ideas')).toMatchObject({ code: 'ideas-401', message: 'Ta session a expiré. Reconnecte-toi.' })
    expect(await functionError(failed(413, null), 'Échec.', 'import')).toMatchObject({ code: 'import-413' })
    expect(await functionError(failed(504, null), 'Échec.', 'ideas')).toMatchObject({ message: 'Le service d’analyse ne répond pas. Réessaie dans un instant.' })
    expect(await functionError(failed(400, null), 'Échec.', 'ideas')).toMatchObject({ message: 'Échec.', code: 'ideas-400' })
  })
})

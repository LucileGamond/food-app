import { AppError, createApi } from '@/api'
import { anonClient, signedInApi } from './helpers'

// Exécute la vraie Edge Function dans le runtime local (sans appel au modèle : les cas testés
// s'arrêtent avant, ce qui évite tout accès réseau et tout coût).
describe('import de recette (Edge Function)', () => {
  it('exige une connexion', async () => {
    const api = createApi(anonClient())
    await expect(api.recipes.importFromUrl('https://exemple.fr/recette')).rejects.toMatchObject({
      message: 'Ta session a expiré. Reconnecte-toi.',
      code: 'import-401',
    })
  })

  it('refuse les adresses locales ou invalides', async () => {
    const { api } = await signedInApi()
    await expect(api.recipes.importFromUrl('http://localhost:54321/rest/v1/recipes')).rejects.toMatchObject({
      message: 'Adresse non autorisée.',
      code: 'import-400',
    })
    await expect(api.recipes.importFromUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('Adresse non autorisée.')
    await expect(api.recipes.importFromUrl('ftp://exemple.fr/recette')).rejects.toBeInstanceOf(AppError)
  })

  it('renvoie une erreur lisible quand la page ne peut pas être analysée', async () => {
    const { api } = await signedInApi()
    // Domaine réservé, jamais résolu : sans clé API locale, la configuration est signalée ;
    // avec une clé, le site est injoignable.
    await expect(api.recipes.importFromUrl('https://recette.invalid/crepes')).rejects.toThrow(
      /Le service d’analyse est mal configuré\.|Impossible de joindre ce site\./,
    )
  })
})

import { AppError, createApi } from '@/api'
import { createAppClient } from '@/lib/supabase'
import { LOCAL_ANON_KEY, anonClient, signedInApi } from './helpers'

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

  it('signale un service injoignable', async () => {
    const api = createApi(createAppClient('http://127.0.0.1:9', LOCAL_ANON_KEY, { persistSession: false }))
    await expect(api.recipes.importFromUrl('https://exemple.fr/recette')).rejects.toMatchObject({ code: 'network' })
  })
})

// Lecture d'une photo par la vraie Edge Function locale (sans clé API : jamais d'appel au modèle).
describe('import de recette depuis une photo (Edge Function)', () => {
  const page = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })

  it('exige une connexion', async () => {
    const api = createApi(anonClient())
    await expect(api.recipes.importFromPhotos([page])).rejects.toMatchObject({ code: 'import-401' })
  })

  it('refuse plus de 2 photos et une photo trop lourde, avec un message clair', async () => {
    const { api } = await signedInApi()
    await expect(api.recipes.importFromPhotos([page, page, page])).rejects.toThrow('2 photos au plus.')
    const heavy = new Blob([new Uint8Array(3_100_000)], { type: 'image/jpeg' })
    await expect(api.recipes.importFromPhotos([heavy])).rejects.toThrow('Photo trop lourde.')
  })

  it('signale un service mal configuré plutôt qu’une erreur vague', async () => {
    const { api } = await signedInApi()
    await expect(api.recipes.importFromPhotos([page])).rejects.toThrow(/Le service d’analyse est mal configuré\.|Le service d’analyse ne répond pas/)
  })
})

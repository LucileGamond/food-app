import { createApi } from '@/api'
import { createAppClient } from '@/lib/supabase'
import { LOCAL_ANON_KEY, anonClient, signedInApi } from './helpers'

const INPUT = { today: '2026-10-27', candidates: [], recent: [] }

// Exécute la vraie Edge Function dans le runtime local, sans clé API : jamais d'appel au modèle ni à la recherche web.
describe('idées de repas (Edge Function)', () => {
  it('exige une connexion', async () => {
    const api = createApi(anonClient())
    await expect(api.ideas.suggestMeals(INPUT)).rejects.toMatchObject({ message: 'Ta session a expiré. Reconnecte-toi.', code: 'ideas-401' })
  })

  it('refuse une entrée invalide, avec le message de la fonction', async () => {
    const { api } = await signedInApi()
    await expect(api.ideas.suggestMeals({ ...INPUT, today: '27/10/2026' })).rejects.toMatchObject({ message: 'Date invalide.', code: 'ideas-400' })
    await expect(api.ideas.suggestMeals({ ...INPUT, candidates: [{ id: 'r1', title: ' ', ingredients: [], tags: [] }] })).rejects.toThrow(
      'Recette invalide.',
    )
  })

  it('signale un service mal configuré ou injoignable', async () => {
    const { api } = await signedInApi()
    // Sans clé API locale, la configuration est signalée (avec une clé, la recherche aurait lieu : non testé ici).
    await expect(api.ideas.suggestMeals(INPUT)).rejects.toMatchObject({ message: 'Le service d’analyse est mal configuré.', code: 'ideas-500' })
    const offline = createApi(createAppClient('http://127.0.0.1:9', LOCAL_ANON_KEY, { persistSession: false }))
    await expect(offline.ideas.suggestMeals(INPUT)).rejects.toMatchObject({ code: 'network' })
  })
})

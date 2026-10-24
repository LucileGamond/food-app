import { AppError } from '@/api'
import { createWeightsApi } from '@/api/weights'
import { ERIC, LUCILE, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

describe('weights api', () => {
  it('enregistre, modifie, déplace et supprime un relevé', async () => {
    const { api } = await signedInApi()
    await api.weights.saveWeighIn('2026-10-01', [
      { profile_id: LUCILE.id, weight_kg: 62.5 },
      { profile_id: ERIC.id, weight_kg: 73.1 },
    ])
    let entries = await api.weights.listEntries()
    expect(entries.map((e) => [e.profile_id, e.measured_on, e.weight_kg])).toEqual(
      expect.arrayContaining([
        [LUCILE.id, '2026-10-01', 62.5],
        [ERIC.id, '2026-10-01', 73.1],
      ]),
    )
    expect(typeof entries[0]!.weight_kg).toBe('number')

    // Modification avec changement de date ; Eric est effacé
    await api.weights.saveWeighIn(
      '2026-10-02',
      [
        { profile_id: LUCILE.id, weight_kg: 62.1 },
        { profile_id: ERIC.id, weight_kg: null },
      ],
      '2026-10-01',
    )
    entries = await api.weights.listEntries()
    expect(entries.map((e) => [e.profile_id, e.measured_on, e.weight_kg])).toEqual([[LUCILE.id, '2026-10-02', 62.1]])

    await api.weights.deleteWeighIn('2026-10-02')
    expect(await api.weights.listEntries()).toEqual([])
  })

  it('remonte les erreurs de validation', async () => {
    const { api } = await signedInApi()
    await expect(api.weights.saveWeighIn('2026-10-01', [{ profile_id: LUCILE.id, weight_kg: null }])).rejects.toThrow(
      'Certaines valeurs sont invalides.',
    )
    await expect(api.weights.saveWeighIn('2026-10-01', [{ profile_id: LUCILE.id, weight_kg: 500 }])).rejects.toBeInstanceOf(AppError)
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createWeightsApi(anonClient())
    await expect(api.listEntries()).rejects.toThrow(/accès/)
    await expect(api.saveWeighIn('2026-10-01', [{ profile_id: LUCILE.id, weight_kg: 60 }])).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteWeighIn('2026-10-01')).rejects.toBeInstanceOf(AppError)
  })

  it('prévient en temps réel des pesées de l’autre personne', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    let events = 0
    let status = ''
    const unsubscribe = lucile.api.weights.subscribe(
      () => {
        events += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      // Même tolérance que pour le planning : le serveur temps réel peut être lent à diffuser
      // juste après un démarrage ; Eric se repèse jusqu'à ce que Lucile soit notifiée.
      const deadline = Date.now() + 30000
      let weight = 72
      while (events === 0 && Date.now() < deadline) {
        await eric.api.weights.saveWeighIn('2026-10-01', [{ profile_id: ERIC.id, weight_kg: weight }])
        weight += 0.1
        await waitFor(() => events > 0, 2000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)
})

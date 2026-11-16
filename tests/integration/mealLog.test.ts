import { ERIC, LUCILE, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

describe('meal log api', () => {
  it('enregistre, remplace et efface les réponses de chaque personne', async () => {
    const { api } = await signedInApi()
    await api.mealLog.set(LUCILE.id, '2026-11-16', 'LUNCH', 'meat')
    await api.mealLog.set(LUCILE.id, '2026-11-16', 'DINNER', 'vegetarian')
    await api.mealLog.set(LUCILE.id, '2026-11-15', 'BREAKFAST', 'skipped')
    await api.mealLog.set(ERIC.id, '2026-11-16', 'LUNCH', 'vegetarian')

    // Remplacement : une seule réponse par moment
    await api.mealLog.set(LUCILE.id, '2026-11-16', 'LUNCH', 'vegetarian')

    const day = await api.mealLog.list(LUCILE.id, '2026-11-16', '2026-11-16')
    expect(day).toHaveLength(2)
    expect(day).toEqual(
      expect.arrayContaining([
        { profile_id: LUCILE.id, eaten_on: '2026-11-16', slot: 'LUNCH', kind: 'vegetarian' },
        { profile_id: LUCILE.id, eaten_on: '2026-11-16', slot: 'DINNER', kind: 'vegetarian' },
      ]),
    )
    expect(await api.mealLog.list(LUCILE.id, '2026-11-01', '2026-11-30')).toHaveLength(3)
    expect(await api.mealLog.list(ERIC.id, '2026-11-01', '2026-11-30')).toHaveLength(1)

    await api.mealLog.clear(LUCILE.id, '2026-11-16', 'LUNCH')
    expect((await api.mealLog.list(LUCILE.id, '2026-11-16', '2026-11-16')).map((e) => e.slot)).toEqual(['DINNER'])
  })

  it('refuse un moment ou une réponse inconnus', async () => {
    const { api } = await signedInApi()
    // @ts-expect-error moment hors du journal
    await expect(api.mealLog.set(LUCILE.id, '2026-11-16', 'SNACK', 'meat')).rejects.toThrow('Certaines valeurs sont invalides.')
    // @ts-expect-error réponse inconnue
    await expect(api.mealLog.set(LUCILE.id, '2026-11-16', 'LUNCH', 'vegan')).rejects.toThrow('Certaines valeurs sont invalides.')
  })

  it('anonyme : aucun accès', async () => {
    const { error } = await anonClient().from('meal_log').select('profile_id')
    expect(error).not.toBeNull()
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import type { WaterIntake } from '@/lib/hydration'
import { fakeApi } from '@/test/fakes'
import { useHydration } from './useHydration'

describe('useHydration', () => {
  it('ne compte pas deux fois un verre déjà reçu par le temps réel', async () => {
    const api = fakeApi()
    const intake: WaterIntake = { id: 'w1', volume_ml: 200, drunk_at: '2026-11-10T09:00:00.000Z' }
    let answer: (value: WaterIntake) => void = () => undefined
    api.hydration.addIntake.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { result } = renderHook(() => useHydration(api, '2026-11-10'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let added: Promise<boolean> = Promise.resolve(false)
    act(() => {
      added = result.current.add(200)
    })
    // Réseau lent : le rechargement temps réel voit le verre avant la réponse de l'ajout.
    api.hydration.listIntakes.mockResolvedValue([intake])
    await act(() => result.current.reload())
    await act(async () => {
      answer(intake)
      await added
    })
    expect(result.current.intakes).toEqual([intake])
  })
})

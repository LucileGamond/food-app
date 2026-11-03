import { act, renderHook, waitFor } from '@testing-library/react'
import { AppError } from '@/api'
import { useAsync } from './useAsync'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAsync', () => {
  it('charge à l’affichage, puis expose la donnée', async () => {
    const load = vi.fn(async () => 'crêpes')
    const { result } = renderHook(() => useAsync(load, []))
    expect(result.current.data).toBeUndefined()
    await waitFor(() => expect(result.current.data).toBe('crêpes'))
    expect(result.current.error).toBeNull()
  })

  it('erreur lisible, puis « Réessayer » la relance et l’efface', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new AppError('réseau')).mockResolvedValue('crêpes')
    const { result } = renderHook(() => useAsync(load, []))
    await waitFor(() => expect(result.current.error).toBe('réseau'))
    act(() => result.current.reload())
    expect(result.current.error).toBeNull()
    await waitFor(() => expect(result.current.data).toBe('crêpes'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('ignore une réponse dépassée quand les dépendances changent', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const load = vi.fn((id: string) => (id === 'a' ? first.promise : second.promise))
    const { result, rerender } = renderHook(({ id }) => useAsync(() => load(id), [id]), { initialProps: { id: 'a' } })
    rerender({ id: 'b' })
    await act(async () => second.resolve('B'))
    await act(async () => first.resolve('A'))
    expect(result.current.data).toBe('B')
  })

  it('setData modifie la donnée sans recharger', async () => {
    const load = vi.fn(async () => ({ note: 3 }))
    const { result } = renderHook(() => useAsync(load, []))
    await waitFor(() => expect(result.current.data).toEqual({ note: 3 }))
    act(() => result.current.setData({ note: 5 }))
    expect(result.current.data).toEqual({ note: 5 })
    expect(load).toHaveBeenCalledTimes(1)
  })
})

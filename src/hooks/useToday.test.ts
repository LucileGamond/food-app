import { act, renderHook } from '@testing-library/react'
import { useToday } from './useToday'

describe('useToday', () => {
  afterEach(() => vi.useRealTimers())

  it('renvoie la date imposée', () => {
    const { result } = renderHook(() => useToday('2026-10-20'))
    expect(result.current).toBe('2026-10-20')
  })

  it('passe au lendemain quand l’application revient au premier plan', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 25, 23, 50))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-10-25')
    vi.setSystemTime(new Date(2026, 9, 26, 7, 30))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-10-26')
    vi.setSystemTime(new Date(2026, 9, 27, 0, 1))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe('2026-10-27')
  })
})

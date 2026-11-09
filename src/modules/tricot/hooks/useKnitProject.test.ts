import { act, renderHook, waitFor } from '@testing-library/react'
import { AppError } from '@/api'
import { fakeApi } from '@/test/fakes'
import { pendingFor, queueProgress } from '../lib/offline'
import type { KnitProject, KnitStep } from '../lib/pattern'
import { useKnitProject } from './useKnitProject'

const step = (id: string, rowCount = 0): KnitStep => ({ id, position: 0, title: id, instructions: '', totalRows: 100, stitches: null, sections: [], rowCount, notes: '', done: false, highlights: {} })
const project = (id = 'p1', rowCount = 0): KnitProject => ({
  id,
  title: `Pull ${id}`,
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  steps: [step(`${id}-s1`, rowCount)],
  charts: [],
  chartHints: [],
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  myGauge: { stitches: null, rows: null },
})

/** Promesse résolue à la main. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const rows = (r: { current: { project: KnitProject | null } }) => r.current.project?.steps[0]?.rowCount

let onLine: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => onLine.mockRestore())

describe('useKnitProject : avancée et file d’attente', () => {
  it('une avancée hors ligne dépassée en ligne n’est pas renvoyée ensuite', async () => {
    const api = fakeApi()
    // Hors ligne, le compteur est passé à 10
    queueProgress('p1', 'p1-s1', { rowCount: 10 })
    // Retour du réseau : l'envoi de l'attente échoue (elle reste)
    api.knitting.saveProgress.mockRejectedValueOnce(new AppError('Connexion impossible.', 'network'))
    api.knitting.getProject.mockResolvedValue(project('p1', 9))
    const { result } = renderHook(() => useKnitProject(api, 'p1'))
    await waitFor(() => expect(rows(result)).toBe(10))
    expect(result.current.pending).toBe(1)

    // 11 compté en ligne : enregistré, l'ancien 10 ne doit plus partir
    await act(() => result.current.countRows('p1-s1', 1))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('p1-s1', { rowCount: 11 })
    expect(pendingFor('p1')).toEqual([])
    expect(result.current.pending).toBe(0)

    api.knitting.saveProgress.mockClear()
    api.knitting.getProject.mockResolvedValue(project('p1', 11))
    await act(() => result.current.reload())
    expect(api.knitting.saveProgress).not.toHaveBeenCalled()
    expect(rows(result)).toBe(11)
  })

  it('un rang compté pendant une relecture n’est pas écrasé par la réponse, et part après elle', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(project('p1', 5))
    const { result } = renderHook(() => useKnitProject(api, 'p1'))
    await waitFor(() => expect(rows(result)).toBe(5))

    const slow = deferred<KnitProject>()
    api.knitting.getProject.mockReturnValueOnce(slow.promise)
    let reloading!: Promise<void>
    act(() => {
      reloading = result.current.reload()
    })
    await waitFor(() => expect(api.knitting.getProject).toHaveBeenCalledTimes(2))
    let counted!: Promise<boolean>
    act(() => {
      counted = result.current.countRows('p1-s1', 1)
    })
    expect(rows(result)).toBe(6)
    // L'écriture attend la relecture (même file)
    expect(api.knitting.saveProgress).not.toHaveBeenCalled()

    // La réponse lancée avant le +1 ne le fait pas reculer
    await act(async () => {
      slow.resolve(project('p1', 5))
      await reloading
    })
    expect(rows(result)).toBe(6)
    await act(async () => void (await counted))
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('p1-s1', { rowCount: 6 })
    // Le +1 suivant part de la bonne valeur
    await act(() => result.current.countRows('p1-s1', 1))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('p1-s1', { rowCount: 7 })
  })

  it('l’envoi de l’attente passe par la file : une écriture en cours finit avant', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(project('p1', 5))
    const { result } = renderHook(() => useKnitProject(api, 'p1'))
    await waitFor(() => expect(rows(result)).toBe(5))
    const order: string[] = []
    const write = deferred<void>()
    api.knitting.saveProgress.mockImplementationOnce(async (_id, p) => {
      order.push(`écrit ${p.rowCount}`)
      await write.promise
    })
    let counted!: Promise<boolean>
    act(() => {
      counted = result.current.countRows('p1-s1', 1)
    })
    queueProgress('p1', 'p1-s1', { notes: 'Aiguilles 4' })
    api.knitting.saveProgress.mockImplementationOnce(async (_id, p) => void order.push(`attente ${p.notes}`))
    let reloading!: Promise<void>
    act(() => {
      reloading = result.current.reload()
    })
    await act(async () => {
      write.resolve()
      await counted
      await reloading
    })
    expect(order).toEqual(['écrit 6', 'attente Aiguilles 4'])
  })

  it('wifi faible (en ligne d’après le navigateur) : l’avancée est mise en attente, pas annulée', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(project('p1', 5))
    const { result } = renderHook(() => useKnitProject(api, 'p1'))
    await waitFor(() => expect(rows(result)).toBe(5))
    api.knitting.saveProgress.mockRejectedValueOnce(new AppError('Connexion impossible. Vérifie ta connexion internet.', 'network'))
    await act(async () => expect(await result.current.countRows('p1-s1', 1)).toBe(true))
    expect(rows(result)).toBe(6)
    expect(pendingFor('p1')).toEqual([['p1-s1', { rowCount: 6 }]])
    expect(result.current.offline).toBe(true)
    expect(result.current.pending).toBe(1)
  })

  it('refus de la base : l’avancée est rétablie', async () => {
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(project('p1', 5))
    const { result } = renderHook(() => useKnitProject(api, 'p1'))
    await waitFor(() => expect(rows(result)).toBe(5))
    api.knitting.saveProgress.mockRejectedValueOnce(new AppError('Impossible d’enregistrer l’avancée.', '42501'))
    await act(async () => expect(await result.current.countRows('p1-s1', 1)).toBe(false))
    expect(rows(result)).toBe(5)
    expect(pendingFor('p1')).toEqual([])
  })

  it('autre projet : l’ancien n’est plus affiché et sa réponse tardive est ignorée', async () => {
    const api = fakeApi()
    const late = deferred<KnitProject>()
    api.knitting.getProject.mockImplementation((id: string) => (id === 'p1' ? late.promise : Promise.resolve(project(id, 3))))
    const { result, rerender } = renderHook(({ id }) => useKnitProject(api, id), { initialProps: { id: 'p1' } })
    expect(result.current.loading).toBe(true)
    rerender({ id: 'p2' })
    await waitFor(() => expect(result.current.project?.id).toBe('p2'))
    await act(async () => late.resolve(project('p1', 9)))
    expect(result.current.project?.id).toBe('p2')
    expect(rows(result)).toBe(3)

    // Passage de p2 à p3 : rien de p2 ne reste pendant le chargement
    const p3 = deferred<KnitProject>()
    api.knitting.getProject.mockReturnValueOnce(p3.promise)
    rerender({ id: 'p3' })
    expect(result.current.project).toBeNull()
    expect(result.current.loading).toBe(true)
    await act(async () => p3.resolve(project('p3', 1)))
    expect(result.current.project?.id).toBe('p3')
  })
})

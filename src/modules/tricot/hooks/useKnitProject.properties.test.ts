// Compteur de rangs : quelle que soit la suite de +1 / −1 (tapés un par un ou deux d'un coup) et les refus de la base,
// l'écran finit sur la valeur enregistrée en base, toujours entre 0 et le dernier rang de l'étape.
import { act, renderHook, waitFor } from '@testing-library/react'
import { AppError } from '@/api'
import { fakeApi } from '@/test/fakes'
import type { KnitProject } from '../lib/pattern'
import { useKnitProject } from './useKnitProject'

const TOTAL = 12

const project = (rowCount: number): KnitProject => ({
  id: 'p1',
  title: 'Pull',
  size: 'M',
  sizes: [],
  sizeIndex: null,
  pdfPath: null,
  steps: [{ id: 's1', position: 0, title: 'Dos', instructions: '', totalRows: TOTAL, stitches: null, sections: [], rowCount, times: 1, pass: 1, notes: '', done: false, highlights: {} }],
  charts: [],
  chartHints: [],
  yarns: [],
  patternGauge: { stitches: null, rows: null },
  gauges: [],
})

function rng(seed: number) {
  let x = seed
  return (n: number) => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x >>> 8) % n
  }
}

let onLine: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => onLine.mockRestore())

describe('compteur : 40 suites au hasard de +1 / −1, avec des refus de la base', () => {
  it('l’écran finit sur la valeur de la base, entre 0 et le dernier rang', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = rng(seed)
      let server = rand(TOTAL + 1)
      const api = fakeApi()
      api.knitting.getProject.mockImplementation(() => Promise.resolve(project(server)))
      api.knitting.saveProgress.mockImplementation((_id: string, p: { rowCount?: number }) => {
        // Un enregistrement sur quatre est refusé (session expirée, contrainte…)
        if (rand(4) === 0) return Promise.reject(new AppError('Impossible d’enregistrer l’avancée.', '42501'))
        server = p.rowCount!
        return Promise.resolve()
      })
      const { result, unmount } = renderHook(() => useKnitProject(api, 'p1'))
      await waitFor(() => expect(result.current.project?.steps[0]?.rowCount).toBe(server))
      for (let op = 0; op < 10; op++) {
        const delta = rand(3) === 0 ? -1 : 1
        await act(async () => {
          // Parfois deux taps d'un coup
          if (rand(3) === 0) await Promise.all([result.current.countRows('s1', delta), result.current.countRows('s1', delta)])
          else await result.current.countRows('s1', delta)
        })
        const shown = result.current.project!.steps[0]!.rowCount
        expect(shown, `graine ${seed}, opération ${op}`).toBeGreaterThanOrEqual(0)
        expect(shown, `graine ${seed}, opération ${op}`).toBeLessThanOrEqual(TOTAL)
      }
      await waitFor(() => expect(result.current.project?.steps[0]?.rowCount, `graine ${seed}`).toBe(server))
      expect(server).toBeGreaterThanOrEqual(0)
      expect(server).toBeLessThanOrEqual(TOTAL)
      unmount()
    }
  }, 60_000)
})

import { buildChart, nearestIndex, spreadLabels } from './chart'

const entry = (profile_id: string, measured_on: string, weight_kg: number) => ({ id: `${profile_id}${measured_on}`, profile_id, measured_on, weight_kg })

describe('buildChart', () => {
  const chart = buildChart(
    [
      { id: 'l', label: 'Lucile', color: 'var(--series-1)', entries: [entry('l', '2026-01-01', 60), entry('l', '2026-01-11', 62)] },
      { id: 'e', label: 'Eric', color: 'var(--series-2)', entries: [entry('e', '2026-01-06', 61)] },
    ],
    '2026-01-01',
    '2026-01-11',
    504,
    240,
  )

  it('place les points sur des échelles linéaires en jours et en kg', () => {
    expect(chart.plot).toEqual({ left: 40, right: 440, top: 12, bottom: 212 })
    const [lucile, eric] = chart.series
    expect(lucile!.points.map((p) => p.x)).toEqual([40, 440])
    expect(eric!.points[0]!.x).toBe(240)
    // Domaine Y [59, 63] : 60 kg → 1/4 de la hauteur depuis le bas
    expect(lucile!.points[0]!.y).toBe(162)
    expect(lucile!.path).toMatch(/^M40,\S+ L440,\S+$/)
    expect(eric!.path).toMatch(/^M240,\S+$/)
  })

  it('fournit graduations et dates du réticule', () => {
    expect(chart.yTicks.map((t) => t.value)).toEqual([59, 60, 61, 62, 63])
    expect(chart.dates.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-06', '2026-01-11'])
    expect(chart.xTicks).toEqual([{ label: 'janv', x: 40 }])
  })

  it('reste valide avec une période d’un seul jour et sans donnée', () => {
    const empty = buildChart([], '2026-01-01', '2026-01-01', 100, 50)
    expect(empty.series).toEqual([])
    expect(empty.dates).toEqual([])
    expect(empty.plot.right).toBeGreaterThan(empty.plot.left)
    expect(empty.plot.bottom).toBeGreaterThan(empty.plot.top)
  })
})

describe('nearestIndex', () => {
  const dates = [{ x: 10 }, { x: 50 }, { x: 100 }]
  it('trouve la date la plus proche', () => {
    expect(nearestIndex(dates, 0)).toBe(0)
    expect(nearestIndex(dates, 29)).toBe(0)
    expect(nearestIndex(dates, 31)).toBe(1)
    expect(nearestIndex(dates, 80)).toBe(2)
    expect(nearestIndex(dates, 500)).toBe(2)
    expect(nearestIndex([{ x: 3 }], 99)).toBe(0)
    expect(nearestIndex([], 5)).toBe(-1)
  })
})

describe('spreadLabels', () => {
  it('écarte les étiquettes trop proches sans changer leur ordre', () => {
    expect(spreadLabels([100, 104], 14, 0, 200)).toEqual([100, 114])
    expect(spreadLabels([104, 100], 14, 0, 200)).toEqual([114, 100])
    expect(spreadLabels([50, 150], 14, 0, 200)).toEqual([50, 150])
  })
  it('reste dans la zone de tracé', () => {
    expect(spreadLabels([195, 198], 14, 0, 200)).toEqual([186, 200])
    expect(spreadLabels([-5], 14, 0, 200)).toEqual([0])
  })
})

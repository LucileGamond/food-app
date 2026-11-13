import { countsFor, gaugeFor, isChecked, rowGaugeFor, sanitizeGauges, withChecked, withGauge, withoutGauge, type ProjectGauge } from './gauges'

const g = (needle: number | null, stitches: number | null, rows: number | null, checked = false): ProjectGauge => ({ needle, stitches, rows, checked })
const NO_PATTERN = { stitches: null, rows: null }

describe('échantillons du projet', () => {
  it('lit la liste en base : une entrée par aiguille, le défaut en tête, les plus fines ensuite', () => {
    const read = sanitizeGauges([
      { needle: 4, stitches: 20, rows: 26, checked: true },
      { needle: 3.5, stitches: 22, rows: 30 },
      { needle: null, stitches: 21, rows: 28 },
      { needle: 4, stitches: 99, rows: 99 },
      { needle: 'quatre' },
      null,
      { needle: 3.5, stitches: 200, rows: -1 },
    ])
    expect(read).toEqual([g(null, 21, 28), g(3.5, 22, 30), g(4, 20, 26, true)])
  })

  it('suit l’échantillon de l’aiguille, sinon celui par défaut, sinon celui du patron', () => {
    const gauges = [g(null, 21, 28), g(3.5, 22, 30)]
    expect(gaugeFor(gauges, 3.5)?.rows).toBe(30)
    expect(gaugeFor(gauges, 4)?.rows).toBe(28)
    expect(gaugeFor([g(3.5, 22, 30)], 4)).toBeNull()
    // Mailles et rangs servis aux calculs
    expect(countsFor(gauges, 3.5, { stitches: 19, rows: 25 })).toEqual({ stitches: 22, rows: 30 })
    expect(countsFor([], 3.5, { stitches: 19, rows: 25 })).toEqual({ stitches: 19, rows: 25 })
    // Échantillon incomplet : le patron complète
    expect(countsFor([g(3.5, null, 30)], 3.5, { stitches: 19, rows: 25 })).toEqual({ stitches: 19, rows: 30 })
  })

  it('dit d’où viennent les rangs d’une conversion', () => {
    const gauges = [g(null, 21, 28), g(3.5, 22, 30)]
    expect(rowGaugeFor(3.5, { gauges, pattern: { stitches: 19, rows: 25 } })).toEqual({ rowsPer10: 30, source: 'mine' })
    expect(rowGaugeFor(4, { gauges, pattern: { stitches: 19, rows: 25 } })).toEqual({ rowsPer10: 28, source: 'mine' })
    expect(rowGaugeFor(4, { gauges: [], pattern: { stitches: 19, rows: 25 } })).toEqual({ rowsPer10: 25, source: 'pattern' })
    expect(rowGaugeFor(4, { gauges: [], pattern: NO_PATTERN })).toBeNull()
  })

  it('valide les conversions d’une aiguille, ou celles du défaut quand elle n’a pas le sien', () => {
    const gauges = [g(null, 21, 28), g(3.5, 22, 30)]
    expect(isChecked(gauges, 3.5)).toBe(false)
    expect(withChecked(gauges, 3.5).find((x) => x.needle === 3.5)?.checked).toBe(true)
    // Aiguille sans échantillon propre : c'est le défaut qui est validé, pour toutes celles qui le suivent
    const checkedDefault = withChecked(gauges, 4)
    expect(checkedDefault.map((x) => [x.needle, x.checked])).toEqual([[null, true], [3.5, false]])
    expect(isChecked(checkedDefault, 4)).toBe(true)
    expect(isChecked(checkedDefault, 3.5)).toBe(false)
    // Aucun échantillon : l'entrée est créée pour garder la vérification
    expect(withChecked([], 3)).toEqual([g(3, null, null, true)])
  })

  it('ajoute, modifie et retire un échantillon ; changer ses rangs le fait revérifier', () => {
    let gauges = withGauge([], g(3.5, 22, 30, true))
    expect(gauges).toEqual([g(3.5, 22, 30, false)])
    gauges = gauges.map((x) => ({ ...x, checked: true }))
    // Mailles seules changées : la vérification tient
    gauges = withGauge(gauges, g(3.5, 23, 30))
    expect(gauges).toEqual([g(3.5, 23, 30, true)])
    // Rangs changés : à revérifier
    gauges = withGauge(gauges, g(3.5, 23, 32))
    expect(gauges).toEqual([g(3.5, 23, 32, false)])
    // Rangé : le défaut d'abord
    gauges = withGauge(gauges, g(null, 20, 26))
    expect(gauges.map((x) => x.needle)).toEqual([null, 3.5])
    expect(withoutGauge(gauges, 3.5).map((x) => x.needle)).toEqual([null])
  })
})

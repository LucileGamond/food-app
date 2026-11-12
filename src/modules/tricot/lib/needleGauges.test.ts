import { isChecked, rowGaugeFor, sanitizeNeedleGauges, withChecked, withGauges, type NeedleGauge } from './needleGauges'

const mine = { stitches: 20, rows: 26 }
const pattern = { stitches: 22, rows: 30 }
const none = { stitches: null, rows: null }

describe('échantillon par aiguille', () => {
  it('lu en base : une entrée par aiguille, valeurs bornées', () => {
    expect(sanitizeNeedleGauges([{ needle: 3, rows: 28.04, stitches: 200, checked: true }, { needle: 3, rows: 1 }, { needle: null, rows: 30 }, 'x', { needle: 'a' }])).toEqual([
      { needle: 3, stitches: null, rows: 28, checked: true },
      { needle: null, stitches: null, rows: 30, checked: false },
    ])
    expect(sanitizeNeedleGauges(null)).toEqual([])
  })

  it('rangs pour 10 cm : ceux de l’aiguille, sinon les tiens, sinon ceux du patron', () => {
    const needleGauges: NeedleGauge[] = [{ needle: 3, stitches: null, rows: 40, checked: false }]
    expect(rowGaugeFor(3, { needleGauges, mine, pattern })).toEqual({ rowsPer10: 40, source: 'mine' })
    expect(rowGaugeFor(3.5, { needleGauges, mine, pattern })).toEqual({ rowsPer10: 26, source: 'mine' })
    expect(rowGaugeFor(3.5, { needleGauges, mine: none, pattern })).toEqual({ rowsPer10: 30, source: 'pattern' })
    expect(rowGaugeFor(null, { needleGauges: [], mine: none, pattern: none })).toBeNull()
  })

  it('vérifié une fois par aiguille ; un échantillon changé fait revérifier', () => {
    const checked = withChecked([], 3.5)
    expect(checked).toEqual([{ needle: 3.5, stitches: null, rows: null, checked: true }])
    expect(isChecked(checked, 3.5)).toBe(true)
    expect(isChecked(checked, 3)).toBe(false)
    expect(withChecked(checked, 3.5)).toEqual(checked)
    // Rangs de l'aiguille changés : à revérifier ; inchangés : gardé
    expect(withGauges(checked, [{ needle: 3.5, stitches: 20, rows: 28, checked: true }], false)).toEqual([{ needle: 3.5, stitches: 20, rows: 28, checked: false }])
    expect(withGauges(checked, [{ needle: 3.5, stitches: 20, rows: null, checked: true }], false)[0]!.checked).toBe(true)
    // Échantillon général changé : seules les aiguilles sans échantillon propre sont à revérifier
    const both: NeedleGauge[] = [...checked, { needle: 3, stitches: null, rows: 40, checked: true }]
    expect(withGauges(both, both, true).map((g) => g.checked)).toEqual([false, true])
  })
})

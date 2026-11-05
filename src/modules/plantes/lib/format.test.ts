import { describeRule, formatAmount, formatCm, formatInterval, formatMonths } from './format'

describe('formatage des règles', () => {
  it('quantités en ml ou en litres', () => {
    expect(formatAmount(250)).toBe('250 ml')
    expect(formatAmount(1000)).toBe('1 L')
    expect(formatAmount(1500)).toBe('1,5 L')
  })

  it('fréquences au singulier et au pluriel', () => {
    expect(formatInterval(1, 'day')).toBe('tous les jours')
    expect(formatInterval(3, 'day')).toBe('tous les 3 jours')
    expect(formatInterval(1, 'week')).toBe('toutes les semaines')
    expect(formatInterval(2, 'week')).toBe('toutes les 2 semaines')
    expect(formatInterval(1, 'month')).toBe('tous les mois')
    expect(formatInterval(6, 'month')).toBe('tous les 6 mois')
  })

  it('périodes', () => {
    expect(formatMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('Toute l’année')
    expect(formatMonths([6])).toBe('Juin')
    expect(formatMonths([6, 7, 8])).toBe('Juin → août')
    expect(formatMonths([1, 2, 11, 12])).toBe('Novembre → février')
  })

  it('résumé d’une règle', () => {
    expect(describeRule({ amount_ml: 1000, interval_count: 1, interval_unit: 'month' })).toBe('1 L tous les mois')
  })

  it('centimètres', () => {
    expect(formatCm(12.5)).toBe('12,5 cm')
  })
})

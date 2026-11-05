import { plantFixture, ruleFixture } from '@/test/plants'
import { emptyRule, hasFormErrors, nextRuleDefaults, toFormValues, toPlantFormOutput, validatePlantForm, type PlantFormValues } from './form'

function values(overrides: Partial<PlantFormValues> = {}): PlantFormValues {
  return { ...toFormValues(null), name: 'Cactus', ...overrides }
}

/** Erreurs à plat : « name », « rules.1.months »… */
function issues(input: PlantFormValues) {
  const errors = validatePlantForm(input)
  return [
    ...Object.entries(errors.fields).flatMap(([path, message]) => (message ? [{ path, message }] : [])),
    ...errors.rules.flatMap((rule, i) => Object.entries(rule).flatMap(([field, message]) => (message ? [{ path: `rules.${i}.${field}`, message }] : []))),
  ]
}

describe('formulaire d’une plante', () => {
  it('nettoie et convertit les valeurs saisies', () => {
    const input = values({
      name: '  Cactus  ',
      species: ' ',
      location: 'Salon ',
      planted_on: '2026-04-01',
      planted_height_cm: '12,5',
      pot_diameter_cm: '',
      notes: '  ',
      rules: [{ ...emptyRule('2026-06-05'), months: [8, 6, 7], amount: '1,5', amount_unit: 'L', interval_unit: 'month', note: ' arrosage du soir ' }],
    })
    expect(hasFormErrors(validatePlantForm(input))).toBe(false)
    expect(toPlantFormOutput(input)).toEqual({
      plant: { name: 'Cactus', species: null, location: 'Salon', planted_on: '2026-04-01', planted_height_cm: 12.5, pot_diameter_cm: null, notes: null },
      rules: [{ months: [6, 7, 8], first_watering_on: '2026-06-05', interval_count: 1, interval_unit: 'month', amount_ml: 1500, note: 'arrosage du soir' }],
    })
  })

  it('exige un nom', () => {
    expect(issues(values({ name: '  ' }))).toEqual([{ path: 'name', message: 'Donne un nom à la plante.' }])
  })

  it('refuse des mesures, dates et textes invalides', () => {
    expect(issues(values({ planted_height_cm: '-2', pot_diameter_cm: 'abc', planted_on: '2026-02-30', notes: 'x'.repeat(4001) })).map((i) => i.path)).toEqual([
      'planted_on',
      'planted_height_cm',
      'pot_diameter_cm',
      'notes',
    ])
  })

  it('rattache les erreurs de règles au bon champ', () => {
    const rules = [
      { ...emptyRule('2026-06-05'), months: [6, 7, 8] },
      { ...emptyRule('2026-08-01'), months: [8, 9], amount: '0', interval_count: '0', note: 'x'.repeat(501) },
    ]
    expect(issues(values({ rules }))).toEqual([
      { path: 'rules.1.note', message: '500 caractères maximum.' },
      { path: 'rules.1.months', message: 'Août est déjà couvert par la règle 1.' },
      { path: 'rules.1.interval_count', message: 'Fréquence entre 1 et 365.' },
      { path: 'rules.1.amount', message: 'Quantité entre 1 ml et 100 L.' },
    ])
  })

  it('date de 1er arrosage manquante', () => {
    expect(issues(values({ rules: [{ ...emptyRule(''), first_watering_on: '' }] }))).toEqual([
      { path: 'rules.0.first_watering_on', message: 'Indique la date du 1er arrosage.' },
    ])
  })
})

describe('nextRuleDefaults', () => {
  it('toute l’année pour la première règle', () => {
    expect(nextRuleDefaults([], '2026-10-24')).toMatchObject({ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], first_watering_on: '2026-10-24' })
  })

  it('les mois restants, 1er arrosage au début de la prochaine période', () => {
    expect(nextRuleDefaults([{ months: [4, 5, 6, 7, 8, 9, 10] }], '2026-10-24')).toMatchObject({ months: [1, 2, 3, 11, 12], first_watering_on: '2026-11-01' })
    expect(nextRuleDefaults([{ months: [6, 7, 8] }], '2026-07-10')).toMatchObject({ first_watering_on: '2026-09-01' })
    expect(nextRuleDefaults([{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }], '2026-12-10')).toMatchObject({ months: [11, 12], first_watering_on: '2026-12-10' })
    expect(nextRuleDefaults([{ months: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }], '2026-12-10')).toMatchObject({ months: [1, 2], first_watering_on: '2027-01-01' })
  })

  it('aucun mois proposé si les mois restants ne se suivent pas ou s’il n’en reste pas', () => {
    expect(nextRuleDefaults([{ months: [6, 7, 8] }, { months: [1] }], '2026-10-24').months).toEqual([])
    expect(nextRuleDefaults([{ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }], '2026-10-24').months).toEqual([])
  })
})

describe('toFormValues', () => {
  it('formulaire vide pour une nouvelle plante', () => {
    expect(toFormValues(null).rules).toEqual([])
  })

  it('reprend une plante existante, quantités rondes en litres', () => {
    const form = toFormValues(
      plantFixture({
        species: null,
        planted_height_cm: 12.5,
        pot_diameter_cm: null,
        rules: [ruleFixture({ amount_ml: 1500 }), ruleFixture({ amount_ml: 250, note: 'doucement' }), ruleFixture({ amount_ml: 1250 })],
      }),
    )
    expect(form.species).toBe('')
    expect(form.planted_height_cm).toBe('12,5')
    expect(form.pot_diameter_cm).toBe('')
    expect(form.rules.map((r) => `${r.amount} ${r.amount_unit} ${r.note}`)).toEqual(['1,5 L ', '250 ml doucement', '1250 ml '])
  })

  it('aller-retour sans perte', () => {
    const plant = plantFixture({ notes: 'Au soleil', rules: [ruleFixture({ months: [6, 7, 8], first_watering_on: '2026-06-05', amount_ml: 1000 })] })
    const form = toFormValues(plant)
    expect(hasFormErrors(validatePlantForm(form))).toBe(false)
    const { plant: input, rules } = toPlantFormOutput(form)
    expect(input.notes).toBe('Au soleil')
    expect(rules[0]).toMatchObject({ months: [6, 7, 8], amount_ml: 1000 })
  })
})

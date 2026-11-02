import { currentStepIndex, describeReminder, dueReminders, nextReminder, reminderRows, type StepReminder } from './pattern'

const decrease: StepReminder = { every: 6, first: null, times: null, action: '2 diminutions' }

describe('rappels d’une étape', () => {
  it('liste les rangs concernés', () => {
    expect(reminderRows(decrease, 20)).toEqual([6, 12, 18])
    expect(reminderRows({ ...decrease, times: 2 }, 40)).toEqual([6, 12])
    expect(reminderRows({ ...decrease, first: 3 }, 20)).toEqual([3, 9, 15])
    expect(reminderRows(decrease, null, 13)).toEqual([6, 12])
    expect(reminderRows({ ...decrease, every: 0 }, 20)).toEqual([])
  })

  it('signale l’action au bon rang', () => {
    const step = { totalRows: 30, reminders: [decrease, { every: 10, first: null, times: 1, action: 'Placer un marqueur' }] }
    expect(dueReminders(step, 6).map((r) => r.action)).toEqual(['2 diminutions'])
    expect(dueReminders(step, 7)).toEqual([])
    expect(dueReminders(step, 10).map((r) => r.action)).toEqual(['Placer un marqueur'])
    expect(dueReminders(step, 20)).toEqual([])
    expect(dueReminders(step, 0)).toEqual([])
    // Après la fin de l'étape : plus rien
    expect(dueReminders({ ...step, totalRows: 10 }, 12)).toEqual([])
  })

  it('annonce le prochain rang et compte les fois déjà faites', () => {
    expect(nextReminder(decrease, 30, 0)).toEqual({ row: 6, doneTimes: 0 })
    expect(nextReminder(decrease, 30, 6)).toEqual({ row: 12, doneTimes: 1 })
    expect(nextReminder({ ...decrease, times: 2 }, 30, 12)).toEqual({ row: null, doneTimes: 2 })
    expect(nextReminder(decrease, null, 100)).toEqual({ row: 102, doneTimes: 16 })
  })

  it('décrit le rappel', () => {
    expect(describeReminder(decrease)).toBe('tous les 6 rangs')
    expect(describeReminder({ ...decrease, times: 4, first: 2 })).toBe('tous les 6 rangs, 4 fois, à partir du rang 2')
    expect(describeReminder({ every: 1, first: 1, times: null, action: 'x' })).toBe('à chaque rang')
  })
})

describe('étape en cours', () => {
  it('est la première non terminée', () => {
    expect(currentStepIndex([{ done: true }, { done: false }, { done: false }])).toBe(1)
    expect(currentStepIndex([{ done: true }, { done: true }])).toBe(1)
    expect(currentStepIndex([])).toBe(0)
  })
})

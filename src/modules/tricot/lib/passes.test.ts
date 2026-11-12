import { describePass, finishPass, hasNextPass, ordinal, withTimes } from './passes'

describe('étape tricotée plusieurs fois', () => {
  it('se décrit seulement si elle se tricote plus d’une fois', () => {
    expect(describePass({ times: 1, pass: 1 })).toBeNull()
    expect(describePass({ times: 2, pass: 1 })).toBe('1re fois sur 2')
    expect(describePass({ times: 3, pass: 2 })).toBe('2e fois sur 3')
    expect(ordinal(1)).toBe('1re')
    expect(ordinal(4)).toBe('4e')
  })

  it('à la fin d’une fois : la suivante repart de 0, la dernière termine l’étape', () => {
    expect(hasNextPass({ times: 2, pass: 1 })).toBe(true)
    expect(finishPass({ times: 2, pass: 1 })).toEqual({ pass: 2, rowCount: 0 })
    expect(hasNextPass({ times: 2, pass: 2 })).toBe(false)
    expect(finishPass({ times: 2, pass: 2 })).toEqual({ done: true })
    expect(finishPass({ times: 1, pass: 1 })).toEqual({ done: true })
  })

  it('changer le nombre de fois garde la fois en cours dans les bornes', () => {
    expect(withTimes({ times: 1, pass: 1 }, 2)).toEqual({ times: 2, pass: 1 })
    expect(withTimes({ times: 3, pass: 3 }, 2)).toEqual({ times: 2, pass: 2 })
    expect(withTimes({ times: 2, pass: 1 }, 0)).toEqual({ times: 1, pass: 1 })
    expect(withTimes({ times: 2, pass: 1 }, 50)).toEqual({ times: 10, pass: 1 })
  })
})

import { loadProgress, saveProgress, splitSteps, toggle } from './cooking'

describe('splitSteps', () => {
  it('une étape par numéro, numéros retirés', () => {
    expect(splitSteps('1. Préchauffer le four.\n2) Mélanger.\n3 - Cuire 20 min.\nÉtape 4 : Servir.')).toEqual([
      'Préchauffer le four.',
      'Mélanger.',
      'Cuire 20 min.',
      'Servir.',
    ])
  })

  it('les lignes sans numéro complètent l’étape en cours ; le texte d’avant est gardé', () => {
    expect(splitSteps('Pour 4 personnes.\n\n1. Mélanger la farine\net le sucre.\n2. Cuire.')).toEqual(['Pour 4 personnes.', 'Mélanger la farine et le sucre.', 'Cuire.'])
  })

  it('puces', () => {
    expect(splitSteps('- Couper\n• Cuire')).toEqual(['Couper', 'Cuire'])
  })

  it('sans numéro : un paragraphe par étape, sinon une ligne par étape', () => {
    expect(splitSteps('Couper les légumes\nen dés.\n\nFaire revenir.')).toEqual(['Couper les légumes en dés.', 'Faire revenir.'])
    expect(splitSteps('Couper.\r\nCuire.\n')).toEqual(['Couper.', 'Cuire.'])
    expect(splitSteps('Tout mélanger et cuire 20 min.')).toEqual(['Tout mélanger et cuire 20 min.'])
  })

  it('un nombre qui n’est pas un numéro d’étape ne coupe pas', () => {
    expect(splitSteps('200 g de farine à tamiser.\nCuire 30 min.')).toEqual(['200 g de farine à tamiser.', 'Cuire 30 min.'])
  })

  it('vide', () => {
    expect(splitSteps(null)).toEqual([])
    expect(splitSteps(' \n ')).toEqual([])
  })
})

describe('progression', () => {
  beforeEach(() => sessionStorage.clear())

  it('gardée pour la séance, retirée quand tout est décoché', () => {
    expect(loadProgress('r1')).toEqual({ ingredients: [], steps: [] })
    saveProgress('r1', { ingredients: [0, 2], steps: [1] })
    expect(loadProgress('r1')).toEqual({ ingredients: [0, 2], steps: [1] })
    expect(loadProgress('r2')).toEqual({ ingredients: [], steps: [] })
    saveProgress('r1', { ingredients: [], steps: [] })
    expect(sessionStorage.length).toBe(0)
  })

  it('ignore un contenu illisible ou un stockage indisponible', () => {
    sessionStorage.setItem('cuisine:r1', '{pas du json')
    expect(loadProgress('r1')).toEqual({ ingredients: [], steps: [] })
    sessionStorage.setItem('cuisine:r1', JSON.stringify({ ingredients: [1, 'x', 2.5], steps: 'non' }))
    expect(loadProgress('r1')).toEqual({ ingredients: [1], steps: [] })

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => saveProgress('r1', { ingredients: [1], steps: [] })).not.toThrow()
    setItem.mockRestore()
  })

  it('toggle', () => {
    expect(toggle([3, 1], 2)).toEqual([1, 2, 3])
    expect(toggle([1, 2], 1)).toEqual([2])
  })
})

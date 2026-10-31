import { resumeStep, splitSteps, toggle } from './cooking'

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
  it('étape à reprendre : la première non cochée', () => {
    expect(resumeStep(null, 3)).toBeNull()
    expect(resumeStep({ ingredients: [], steps: [] }, 3)).toBeNull()
    expect(resumeStep({ ingredients: [1], steps: [] }, 3)).toBe(1)
    expect(resumeStep({ ingredients: [], steps: [0, 2] }, 3)).toBe(2)
    expect(resumeStep({ ingredients: [], steps: [0, 1, 2] }, 3)).toBe(3)
  })

  it('toggle', () => {
    expect(toggle([3, 1], 2)).toEqual([1, 2, 3])
    expect(toggle([1, 2], 1)).toEqual([2])
  })
})

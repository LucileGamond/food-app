import { effectiveNeedles, formatNeedle, parseNeedles, readNeedle, sanitizeNeedles } from './needles'
import { readyIssues } from './ready'
import type { StepSection } from './pattern'

const rows = (n: number, text: string, needle?: number): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null, ...(needle !== undefined ? { needle } : {}) })

describe('aiguilles', () => {
  it('liste du projet : bornée, sans doublon, de la plus fine à la plus grosse', () => {
    expect(sanitizeNeedles([3.5, 3, 3.5, 0, 40, '4', 2.333])).toEqual([2.33, 3, 3.5])
    expect(sanitizeNeedles(null)).toEqual([])
    expect(sanitizeNeedles(Array.from({ length: 12 }, (_, i) => i + 1))).toHaveLength(10)
  })

  it('saisie : virgule décimale, séparées par espace ou point-virgule, « mm » accepté', () => {
    expect(parseNeedles('3, 3,5')).toEqual([3, 3.5])
    expect(parseNeedles('3,5 ; 4 mm')).toEqual([3.5, 4])
    expect(parseNeedles('3.5 4')).toEqual([3.5, 4])
    expect(parseNeedles('')).toEqual([])
    expect(parseNeedles('trois')).toBeNull()
    expect(formatNeedle(3.5)).toBe('3,5 mm')
    expect([readNeedle(3.5), readNeedle('3'), readNeedle(0)]).toEqual([3.5, null, null])
  })

  it('aiguille de chaque sous-étape : la sienne, sinon celle d’avant ; la seule du projet par défaut', () => {
    const sections = [rows(10, 'côtes', 3), rows(30, 'jersey', 3.5), rows(4, 'jersey'), rows(6, 'côtes', 3)]
    expect(effectiveNeedles(sections, [3, 3.5])).toEqual([3, 3.5, 3.5, 3])
    expect(effectiveNeedles([rows(10, 'côtes'), rows(4, 'jersey')], [4])).toEqual([4, 4])
    expect(effectiveNeedles([rows(10, 'côtes'), rows(4, 'jersey', 4)], [3, 4])).toEqual([null, 4])
  })

  it('prête à tricoter : aiguille à choisir quand le projet en a plusieurs, sauf héritée', () => {
    const step = { sections: [rows(10, 'côtes'), rows(30, 'jersey', 3.5), rows(4, 'jersey')] }
    expect(readyIssues(step, [3, 3.5]).map((i) => i.text)).toEqual(['Sous-étape 1 (10 rangs : côtes) : aiguille à choisir.'])
    // Une seule aiguille : elle vaut partout ; aucune au projet : rien n'est demandé
    expect(readyIssues(step, [3.5])).toEqual([])
    expect(readyIssues(step, [])).toEqual([])
  })
})

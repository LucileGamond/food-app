import type { StepSection } from './pattern'
import { anchoredSections, textOf, withoutSection } from './sources'

const rows = (n: number | null, text: string, source?: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null, ...(source ? { source } : {}) })

describe('texte du patron porté par les sous-étapes', () => {
  it('ancienne étape : son texte va à la première sous-étape, ou à une sous-étape créée', () => {
    expect(anchoredSections({ title: 'Dos', totalRows: 30, instructions: 'Tout.', sections: [rows(10, 'a'), rows(20, 'b')] })).toEqual([rows(10, 'a', 'Tout.'), rows(20, 'b')])
    expect(anchoredSections({ title: 'Dos', totalRows: 30, instructions: 'Tout.', sections: [] })).toEqual([rows(30, 'Dos', 'Tout.')])
    // Déjà réparti, ou sans texte : rien ne change
    const sourced = [rows(10, 'a', 'A'), rows(20, 'b')]
    expect(anchoredSections({ title: 'Dos', totalRows: 30, instructions: 'A', sections: sourced })).toBe(sourced)
    expect(anchoredSections({ title: 'Dos', totalRows: 30, instructions: ' ', sections: [rows(1, 'a')] })).toEqual([rows(1, 'a')])
  })

  it('texte de l’étape : celui des sous-étapes, dans l’ordre', () => {
    expect(textOf([rows(1, 'a', 'A'), rows(1, 'b'), rows(1, 'c', ' C ')])).toBe('A\n\nC')
    expect(textOf([])).toBe('')
  })

  it('sous-étape supprimée : son texte passe à la précédente (la suivante pour la première)', () => {
    const sections = [rows(1, 'a', 'A'), rows(1, 'b', 'B'), rows(1, 'c')]
    expect(withoutSection(sections, 1)).toEqual([rows(1, 'a', 'A\n\nB'), rows(1, 'c')])
    expect(withoutSection(sections, 0)).toEqual([rows(1, 'b', 'A\n\nB'), rows(1, 'c')])
    expect(withoutSection([rows(1, 'a'), rows(1, 'b', 'B')], 0)).toEqual([rows(1, 'b', 'B')])
    // Dernière sous-étape : rien pour la garder (le texte reste celui de l'étape)
    expect(withoutSection([rows(1, 'a', 'A')], 0)).toEqual([])
  })
})

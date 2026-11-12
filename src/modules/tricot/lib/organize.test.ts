import { isStarted, moveSection, sectionLength, splitStep } from './organize'
import type { StepSection } from './pattern'

const rows = (n: number | null, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })
const repeat = (every: number | null, times: number | null, at?: StepSection['at']): StepSection => ({ kind: 'repeat', rows: null, every, times, actions: [{ text: '1 dim.', rank: null }], text: '', pattern: null, ...(at ? { at } : {}) })

describe('organiser les étapes', () => {
  const back = { id: 'b', title: 'Dos', instructions: '', totalRows: 50, sections: [rows(10, 'côtes'), repeat(4, 5), rows(20, 'jersey')] }
  const sleeve = { id: 's', title: 'Manche', instructions: '', totalRows: 30, sections: [rows(30, 'côtes')] }

  it('longueur d’une sous-étape quand on la connaît', () => {
    expect([rows(10, ''), rows(null, ''), repeat(4, 5), repeat(4, null), repeat(null, 3), repeat(2, 3, { row: 5, pattern: null })].map(sectionLength)).toEqual([10, null, 20, null, null, 0])
  })

  it('déplacer une sous-étape à la fin d’une autre étape : les rangs suivent', () => {
    expect(moveSection(back, 1, sleeve)).toEqual([
      { id: 'b', sections: [rows(10, 'côtes'), rows(20, 'jersey')], totalRows: 30, instructions: '' },
      { id: 's', sections: [rows(30, 'côtes'), repeat(4, 5)], totalRows: 50, instructions: '' },
    ])
    // Longueur inconnue : rangs des deux étapes inconnus ; dernière sous-étape : l'étape garde son nombre de rangs
    const [from, to] = moveSection({ ...back, sections: [rows(null, 'jersey')] }, 0, sleeve)
    expect([from.totalRows, to.totalRows]).toEqual([50, null])
  })

  it('« en même temps » déplacé : son début est à régler dans la nouvelle étape', () => {
    const neck = repeat(2, 3, { row: 15, pattern: null })
    const [, to] = moveSection({ ...back, sections: [...back.sections, neck] }, 3, sleeve)
    expect(to.sections[1]!.at).toEqual({ row: null, pattern: 'rang 15 de « Dos »' })
    expect(to.totalRows).toBe(30)
  })

  it('séparer une étape : la suite fait une nouvelle étape, rangs et débuts recomptés', () => {
    const neck = repeat(2, 3, { row: 35, pattern: null })
    expect(splitStep({ ...back, sections: [...back.sections, neck] }, 2)).toEqual({
      first: { sections: [rows(10, 'côtes'), repeat(4, 5)], totalRows: 30, instructions: '' },
      second: { title: 'Dos (suite)', sections: [rows(20, 'jersey'), { ...neck, at: { row: 5, pattern: null } }], totalRows: 20, instructions: '' },
    })
    // Rangs d'avant inconnus : rangs inconnus, début « en même temps » à régler
    const split = splitStep({ ...back, totalRows: null, sections: [rows(null, 'côtes'), rows(20, 'jersey'), neck] }, 1)
    expect(split.first.totalRows).toBeNull()
    expect(split.second.totalRows).toBeNull()
    expect(split.second.sections[1]!.at).toEqual({ row: null, pattern: 'rang 35 de « Dos »' })
  })

  it('le texte suit la sous-étape : déplacée, séparée ; texte d’une ancienne étape confié à sa première sous-étape', () => {
    const sourced = { ...back, sections: back.sections.map((x, i) => ({ ...x, source: `P${i}` })), instructions: 'P0\n\nP1\n\nP2' }
    const [from, to] = moveSection(sourced, 1, { ...sleeve, instructions: 'Manche.' })
    expect([from.instructions, to.instructions]).toEqual(['P0\n\nP2', 'Manche.\n\nP1'])
    const split = splitStep(sourced, 2)
    expect([split.first.instructions, split.second.instructions]).toEqual(['P0\n\nP1', 'P2'])
    // Ancienne étape (texte sur l'étape seulement) : tout le texte part avec la première sous-étape
    const legacy = splitStep({ ...back, instructions: 'Tout le dos.' }, 1)
    expect([legacy.first.instructions, legacy.second.instructions]).toEqual(['Tout le dos.', ''])
  })

  it('une étape commencée ne se réorganise plus', () => {
    expect(isStarted({ rowCount: 0, done: false, pass: 1 })).toBe(false)
    expect([{ rowCount: 1, done: false, pass: 1 }, { rowCount: 0, done: true, pass: 1 }, { rowCount: 0, done: false, pass: 2 }].map(isStarted)).toEqual([true, true, true])
  })
})

import { mergeBlocker, mergeSteps } from './merge'
import type { StepSection } from './pattern'

const rows = (n: number | null, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })
const repeat = (every: number, times: number, at?: StepSection['at']): StepSection => ({ kind: 'repeat', rows: null, every, times, actions: [{ text: '1 dim.', rank: null }], text: '', pattern: null, ...(at ? { at } : {}) })

describe('regrouper une étape avec la suivante', () => {
  it('les sous-étapes de la suivante viennent à la suite ; les rangs s’additionnent', () => {
    expect(mergeSteps({ instructions: '', title: 'Dos – côtes', totalRows: 18, sections: [rows(18, 'côtes')] }, { instructions: '', title: 'Dos – jersey', totalRows: 100, sections: [rows(100, 'jersey')] })).toEqual({
      sections: [rows(18, 'côtes'), rows(100, 'jersey')],
      totalRows: 118,
    })
  })

  it('étape sans sous-étape : une sous-étape à son nom ; rangs tirés des sous-étapes si l’étape n’en a pas le nombre', () => {
    expect(mergeSteps({ instructions: '', title: 'Côtes', totalRows: null, sections: [] }, { instructions: '', title: 'Jersey', totalRows: 40, sections: [] })).toEqual({
      sections: [rows(null, 'Côtes'), rows(40, 'Jersey')],
      totalRows: null,
    })
    expect(mergeSteps({ instructions: '', title: 'Côtes', totalRows: null, sections: [rows(12, 'côtes')] }, { instructions: '', title: 'Jersey', totalRows: null, sections: [repeat(2, 5)] }).totalRows).toBe(22)
  })

  it('« en même temps » dans la suivante : décalé des rangs de la première, ou à régler s’ils ne sont pas connus', () => {
    const second = { instructions: '', title: 'Raglan', totalRows: null, sections: [repeat(2, 20), repeat(2, 3, { row: 15, pattern: null })] }
    expect(mergeSteps({ instructions: '', title: 'Mise en place', totalRows: 2, sections: [] }, second).sections[2]!.at).toEqual({ row: 17, pattern: null })
    expect(mergeSteps({ instructions: '', title: 'Mise en place', totalRows: null, sections: [] }, second).sections[2]!.at).toEqual({ row: null, pattern: 'rang 15 de « Raglan »' })
    const height = repeat(2, 3, { row: null, pattern: '15 cm' })
    expect(mergeSteps({ instructions: '', title: 'A', totalRows: 2, sections: [] }, { instructions: '', title: 'B', totalRows: null, sections: [height] }).sections[1]).toBe(height)
  })

  it('refusé si la suivante est commencée ou si le patron est adapté', () => {
    const fresh = { rowCount: 0, done: false, pass: 1 }
    expect(mergeBlocker(fresh, false)).toBeNull()
    expect(mergeBlocker(null, false)).toBeNull()
    expect(mergeBlocker({ ...fresh, rowCount: 2 }, false)).toContain('commencée')
    expect(mergeBlocker({ ...fresh, pass: 2 }, false)).toContain('commencée')
    expect(mergeBlocker({ ...fresh, done: true }, false)).toContain('commencée')
    expect(mergeBlocker(fresh, true)).toContain('adaptation')
  })
})

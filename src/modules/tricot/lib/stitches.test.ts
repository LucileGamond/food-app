import type { StepSection } from './pattern'
import { guessStitches, stitchTrack } from './stitches'

const rows = (n: number | null): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text: 'jersey', pattern: n === null ? '5 cm' : null })
const repeat = (every: number, times: number | null, actions: StepSection['actions']): StepSection => ({ kind: 'repeat', rows: null, every, times, actions, text: '', pattern: null })

// 4 rangs, puis 1 dim. de chaque côté (−2) tous les 2 rangs, 3 fois : rangs 6, 8, 10 ; 64 mailles à la fin.
const DECREASES = [rows(4), repeat(2, 3, [{ text: '1 dim. de chaque côté', rank: null, stitches: -2 }])]

describe('mailles en fin de rang', () => {
  it('remonte depuis la fin de l’étape : sûr quand les effets sont donnés', () => {
    const at = stitchTrack({ sections: DECREASES, totalRows: 12, stitches: 64 })
    expect(at(1)).toEqual({ kind: 'sure', stitches: 70 })
    expect(at(5)).toEqual({ kind: 'sure', stitches: 70 })
    // Le rang de la diminution compte la diminution
    expect(at(6)).toEqual({ kind: 'sure', stitches: 68 })
    expect(at(10)).toEqual({ kind: 'sure', stitches: 64 })
    expect(at(12)).toEqual({ kind: 'sure', stitches: 64 })
  })

  it('effet deviné d’après le texte : estimation, avec la raison', () => {
    const at = stitchTrack({ sections: [rows(2), repeat(4, 2, [{ text: '1 augmentation de chaque côté', rank: null }, { text: 'placer un marqueur', rank: 1 }])], totalRows: 10, stitches: 24 })
    expect(at(6)).toEqual({
      kind: 'estimate',
      stitches: 22,
      reasons: ['Effet de « placer un marqueur » inconnu (compté 0).', 'Effet de « 1 augmentation de chaque côté » deviné : +2 mailles.'],
    })
    // Un effet corrigé à 0 rend le marqueur sûr
    const fixed = stitchTrack({ sections: [rows(2), repeat(4, 2, [{ text: '1 aug.', rank: null, stitches: 1 }, { text: 'marqueur', rank: 1, stitches: 0 }])], totalRows: 10, stitches: 24 })
    expect(fixed(10)).toEqual({ kind: 'sure', stitches: 24 })
    expect(fixed(1)).toEqual({ kind: 'sure', stitches: 22 })
  })

  it('inconnu : mailles de fin non indiquées, section à régler, répétition sans fin connue, compte faux', () => {
    expect(stitchTrack({ sections: DECREASES, totalRows: 12, stitches: null })(3)).toMatchObject({ kind: 'unknown', reason: expect.stringContaining('mailles à la fin') })
    expect(stitchTrack({ sections: [rows(null), ...DECREASES], totalRows: 30, stitches: 64 })(3)).toMatchObject({ kind: 'unknown', reason: 'Une section est à régler en rangs.' })
    expect(stitchTrack({ sections: [repeat(2, null, [{ text: '1 aug.', rank: null, stitches: 1 }])], totalRows: null, stitches: 30 })(3)).toMatchObject({ kind: 'unknown', reason: expect.stringContaining('jusqu’à la fin de l’étape') })
    // Répétition jusqu'à la fin, nombre de rangs connu : on sait
    expect(stitchTrack({ sections: [repeat(2, null, [{ text: '1 aug.', rank: null, stitches: 1 }])], totalRows: 6, stitches: 30 })(1)).toEqual({ kind: 'sure', stitches: 27 })
    // 3 fois +2 pour finir à 4 mailles : on serait parti de −2
    expect(stitchTrack({ sections: [repeat(2, 3, [{ text: '1 aug. de chaque côté', rank: null, stitches: 2 }])], totalRows: 6, stitches: 4 })(1)).toMatchObject({ kind: 'unknown', reason: expect.stringContaining('ne tombe pas juste') })
  })

  it('étape sans section : le nombre de mailles ne change pas', () => {
    expect(stitchTrack({ sections: [], totalRows: 18, stitches: 64 })(9)).toEqual({ kind: 'sure', stitches: 64 })
  })

  it('devine l’effet d’une action d’après son texte', () => {
    expect(guessStitches('1 diminution de chaque côté')).toBe(-2)
    expect(guessStitches('2 dim. de chaque côté')).toBe(-4)
    // 2 mailles tricotées ensemble : 1 de moins ; 3 ensemble : 2 de moins
    expect(guessStitches('Tricoter 2 m. ensemble')).toBe(-1)
    expect(guessStitches('3 m. ens. de chaque côté')).toBe(-4)
    expect(guessStitches('1 aug')).toBe(1)
    expect(guessStitches('augmenter 3 fois')).toBe(3)
    expect(guessStitches('dec 1 st each side')).toBeNull()
    expect(guessStitches('placer un marqueur')).toBeNull()
  })
})

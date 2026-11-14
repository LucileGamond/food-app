import { EMPTY_YARN, ideaFit, ideasFromJson, ideasKey, ideaYarn, patternNote, stashMeters, type Yarn } from './yarn'

const MERINO: Yarn = { ...EMPTY_YARN, brand: 'DROPS', name: 'Merino', composition: 'laine', length_m: 105, skeins: 8, needle_mm: 4 }
const ALPACA: Yarn = { ...EMPTY_YARN, name: 'Alpaga', length_m: 100, skeins: 1.5 }

describe('idées pour ma laine', () => {
  it('clé d’un ensemble de laines : triée, sans doublon', () => {
    expect(ideasKey(['b', 'a', 'b'])).toEqual(['a', 'b'])
    expect(ideasKey(['a'])).toEqual(['a'])
  })

  it('laine décrite au modèle', () => {
    expect(ideaYarn(MERINO)).toEqual({ yarn: 'DROPS Merino, laine · 105 m · aiguilles 4 mm', meters: 840, needle_mm: 4 })
    expect(ideaYarn({ ...EMPTY_YARN, name: 'X' })).toEqual({ yarn: 'X', meters: null, needle_mm: null })
  })

  it('métrage de plusieurs laines : somme, ou inconnu si l’un manque', () => {
    expect(stashMeters([MERINO, ALPACA])).toBe(990)
    expect(stashMeters([MERINO, EMPTY_YARN])).toBeNull()
    expect(stashMeters([])).toBeNull()
  })

  it('assez de laine, tout juste, ou combien il en manque', () => {
    expect(ideaFit(300, [MERINO])).toEqual({ enough: true, label: 'Assez de laine (reste ≈ 540 m)' })
    expect(ideaFit(840, [MERINO])).toEqual({ enough: true, label: 'Assez de laine, tout juste' })
    expect(ideaFit(900, [MERINO])).toEqual({ enough: false, label: 'Il manque ≈ 60 m (1 pelote)' })
    expect(ideaFit(1100, [MERINO])).toEqual({ enough: false, label: 'Il manque ≈ 260 m (3 pelotes)' })
    // Plusieurs laines : pelotes non comptées
    expect(ideaFit(1100, [MERINO, ALPACA])).toEqual({ enough: false, label: 'Il manque ≈ 110 m' })
    // Inconnu d'un côté ou de l'autre
    expect(ideaFit(null, [MERINO])).toBeNull()
    expect(ideaFit(300, [EMPTY_YARN])).toBeNull()
  })

  it('gratuit, payant et langue d’un patron', () => {
    expect(patternNote({ free: true, language: 'fr' })).toBe('Gratuit · FR')
    expect(patternNote({ free: false, language: null })).toBe('Payant')
    expect(patternNote({ free: null, language: 'en' })).toBe('EN')
    expect(patternNote({ free: null, language: null })).toBe('')
  })

  it('idées lues en base : champs manquants complétés, entrées invalides ignorées', () => {
    expect(ideasFromJson(null)).toEqual([])
    expect(
      ideasFromJson([
        { title: 'Bonnet', meters: 150, patterns: [{ url: 'https://p.exemple/b', free: true, language: 'fr' }, { title: 'sans adresse' }, null] },
        { title: 'Snood', why: 'Doux.', size: 'adulte', needleMm: 4, search: 'cowl', meters: 'beaucoup', patterns: 'x' },
        { why: 'sans titre' },
        'texte',
      ]),
    ).toEqual([
      { title: 'Bonnet', why: '', size: '', meters: 150, needleMm: null, search: '', patterns: [{ title: 'https://p.exemple/b', url: 'https://p.exemple/b', free: true, language: 'fr' }] },
      { title: 'Snood', why: 'Doux.', size: 'adulte', meters: null, needleMm: 4, search: 'cowl', patterns: [] },
    ])
  })
})

import { EMPTY_YARN, hueName, ideaFit, ideasFromJson, ideasKey, ideaYarn, patternNote, stashMeters, type Yarn } from './yarn'

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
    const none = { free: null, language: null, meters: null, metersMax: null }
    expect(patternNote({ ...none, free: true, language: 'fr' })).toBe('Gratuit · FR')
    expect(patternNote({ ...none, free: false })).toBe('Payant')
    expect(patternNote({ ...none, language: 'en', meters: 300 })).toBe('EN · 300 m')
    expect(patternNote({ ...none, meters: 300, metersMax: 600 })).toBe('300 à 600 m')
    // Maximum sans minimum : ignoré
    expect(patternNote({ ...none, metersMax: 600 })).toBe('')
    expect(patternNote(none)).toBe('')
  })

  it('idées lues en base : champs manquants complétés, entrées invalides ignorées', () => {
    expect(ideasFromJson(null)).toEqual([])
    expect(
      ideasFromJson([
        { title: 'Bonnet', meters: 150, patterns: [{ url: 'https://p.exemple/b', free: true, language: 'fr', meters: 300, metersMax: 'x' }, { title: 'sans adresse' }, null] },
        { title: 'Snood', why: 'Doux.', size: 'adulte', needleMm: 4, search: 'cowl', meters: 'beaucoup', patterns: 'x' },
        { why: 'sans titre' },
        'texte',
      ]),
    ).toEqual([
      { title: 'Bonnet', why: '', size: '', meters: 150, needleMm: null, search: '', patterns: [{ title: 'https://p.exemple/b', url: 'https://p.exemple/b', free: true, language: 'fr', meters: 300, metersMax: null }] },
      { title: 'Snood', why: 'Doux.', size: 'adulte', meters: null, needleMm: 4, search: 'cowl', patterns: [] },
    ])
  })

  it('teintes en mots : couleurs franches, clair et foncé, neutres, marron et beige', () => {
    expect(
      Object.fromEntries(
        ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#1e3a5f', '#8e44ad', '#e84393', '#f8c8dc', '#000000', '#ffffff', '#7f7f7f', '#d9d9d9', '#333333', '#6b3e1f', '#e8d8b8'].map((h) => [h, hueName(h)]),
      ),
    ).toEqual({
      '#c0392b': 'rouge',
      '#e67e22': 'orange',
      '#f1c40f': 'jaune',
      '#27ae60': 'vert',
      '#2980b9': 'bleu',
      '#1e3a5f': 'bleu foncé',
      '#8e44ad': 'violet',
      '#e84393': 'rose',
      '#f8c8dc': 'rose clair',
      '#000000': 'noir',
      '#ffffff': 'blanc',
      '#7f7f7f': 'gris',
      '#d9d9d9': 'gris clair',
      '#333333': 'gris foncé',
      '#6b3e1f': 'marron',
      '#e8d8b8': 'beige',
    })
    expect(hueName('1e3a5f')).toBe('bleu foncé')
    expect(hueName('bleu')).toBeNull()
    expect(hueName('#12345')).toBeNull()
  })
})

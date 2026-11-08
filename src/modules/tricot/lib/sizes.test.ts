import { highlightParts, sanitizeHighlights, sizedParts, sizeIndexOf, toggleHighlight, type SizedPart } from './sizes'

/** Texte avec le nombre de la taille choisie entre [crochets] et ceux des autres tailles entre {accolades}. */
function render(parts: SizedPart[]): string {
  return parts.map((p) => (p.kind === 'text' ? p.text : p.chosen ? `[${p.text}]` : `{${p.text}}`)).join('')
}

describe('sizedParts', () => {
  it('met en valeur le nombre de la taille choisie, entre parenthèses', () => {
    expect(render(sizedParts('Monter 60 (64-68-72) m.', 4, 1))).toBe('Monter {60} ([64]-{68}-{72}) m.')
    expect(render(sizedParts('Monter 60 (64-68-72) m.', 4, 0))).toBe('Monter [60] ({64}-{68}-{72}) m.')
    expect(render(sizedParts('tricoter 12 [14, 16] cm', 3, 2))).toBe('tricoter {12} [{14}, [16]] cm')
    expect(render(sizedParts('8 ( 10 / 12 ) rangs', 3, 1))).toBe('{8} ( [10] / {12} ) rangs')
  })

  it('reconnaît les listes sans parenthèses à partir de 3 tailles', () => {
    expect(render(sizedParts('Monter 60/64/68 m.', 3, 2))).toBe('Monter {60}/{64}/[68] m.')
    expect(render(sizedParts('soit 4-6-8 fois', 3, 0))).toBe('soit [4]-{6}-{8} fois')
    // Deux tailles : « 1/2 » pourrait être une fraction
    expect(render(sizedParts('1/2 tour', 2, 0))).toBe('1/2 tour')
  })

  it('garde les décimales et ignore les groupes qui n’ont pas le bon nombre de tailles', () => {
    expect(render(sizedParts('aiguilles 3,5 (4-4,5) mm', 3, 2))).toBe('aiguilles {3,5} ({4}-[4,5]) mm')
    expect(render(sizedParts('côtes 2/2 sur 10 (12) cm', 4, 1))).toBe('côtes 2/2 sur 10 (12) cm')
    expect(render(sizedParts('rangs 1 à 4, puis 5-8', 4, 1))).toBe('rangs 1 à 4, puis 5-8')
  })

  it('traite plusieurs groupes et laisse le texte tel quel', () => {
    const text = 'Monter 60 (64-68) m.\nTricoter 10 (12-14) cm puis rabattre 4 (4-6) m.'
    expect(render(sizedParts(text, 3, 2))).toBe('Monter {60} ({64}-[68]) m.\nTricoter {10} ({12}-[14]) cm puis rabattre {4} ({4}-[6]) m.')
    expect(sizedParts(text, 3, 2).map((p) => p.text).join('')).toBe(text)
  })

  it('reconnaît les tailles en alternance, une sur deux entre parenthèses', () => {
    expect(render(sizedParts('Monter 43(43)44(45)46(47)48 m.', 7, 3))).toBe('Monter {43}({43}){44}([45]){46}({47}){48} m.')
    expect(render(sizedParts('Monter 43 (43) 44 (45) 46 (47) 48 m.', 7, 0))).toBe('Monter [43] ({43}) {44} ({45}) {46} ({47}) {48} m.')
    // Nombre pair de tailles : le groupe se termine par une parenthèse
    expect(render(sizedParts('rabattre 4(5)6(7) m.', 4, 3))).toBe('rabattre {4}({5}){6}([7]) m.')
    // Un nombre qui suit le groupe n'en fait pas partie
    expect(render(sizedParts('tricoter 4(5)6(7) 2 fois', 4, 1))).toBe('tricoter {4}([5]){6}({7}) 2 fois')
    // Trop de nombres pour les tailles du patron : rien
    expect(render(sizedParts('Monter 43(43)44(45)46 m.', 3, 1))).toBe('Monter 43(43)44(45)46 m.')
    expect(render(sizedParts('Monter 43(43)44(45) m.', 3, 1))).toBe('Monter 43(43)44(45) m.')
    // Suivi d'un tiret : reconnu quand même
    expect(render(sizedParts('4(5)6(7) - puis', 4, 0))).toBe('[4]({5}){6}({7}) - puis')
    // Pas assez de nombres pour les tailles du patron : rien
    expect(render(sizedParts('Monter 43(43)44 m.', 7, 1))).toBe('Monter 43(43)44 m.')
    // Les groupes à liste restent reconnus
    expect(render(sizedParts('Monter 60 (64) m.', 2, 1))).toBe('Monter {60} ([64]) m.')
  })

  it('sans tailles connues, tout reste du texte', () => {
    expect(sizedParts('Monter 60 (64) m.', 1, 0)).toEqual([{ kind: 'text', text: 'Monter 60 (64) m.' }])
    expect(sizedParts('Monter 60 (64) m.', 2, null)).toEqual([{ kind: 'text', text: 'Monter 60 (64) m.' }])
    expect(sizedParts('Monter 60 (64) m.', 2, 5)).toEqual([{ kind: 'text', text: 'Monter 60 (64) m.' }])
    expect(sizedParts('', 2, 0)).toEqual([])
  })
})

describe('sizeIndexOf', () => {
  it('retrouve la taille choisie parmi celles du patron', () => {
    expect(sizeIndexOf(['S', 'M', 'L'], ' m ')).toBe(1)
    expect(sizeIndexOf(['2 ans', '4  ans'], '4 ans')).toBe(1)
    expect(sizeIndexOf(['S', 'M'], 'XL')).toBeNull()
  })
})

describe('corrections du surlignage', () => {
  const TEXT = 'Monter 60 (64-68) m. puis 12 rangs'
  const show = (parts: ReturnType<typeof highlightParts>) =>
    parts.map((p) => (p.kind === 'text' ? p.text : p.state === 'chosen' ? `[${p.text}]` : p.state === 'other' ? `{${p.text}}` : `<${p.text}>`)).join('')

  it('repère tous les nombres, avec leur position', () => {
    const parts = highlightParts(TEXT, 3, 1)
    expect(show(parts)).toBe('Monter {60} ([64]-{68}) m. puis <12> rangs')
    expect(parts.filter((p) => p.kind === 'number').map((p) => [p.text, p.start])).toEqual([
      ['60', 7],
      ['64', 11],
      ['68', 14],
      ['12', 26],
    ])
    expect(parts.map((p) => p.text).join('')).toBe(TEXT)
  })

  it('laisse les chiffres collés à un mot (« k2tog », « C4F »)', () => {
    const parts = highlightParts('k2tog, C4F puis 3 rangs', 0, null)
    expect(parts.filter((p) => p.kind === 'number').map((p) => p.text)).toEqual(['3'])
    expect(parts.map((p) => p.text).join('')).toBe('k2tog, C4F puis 3 rangs')
  })

  it('applique les corrections de la taille mise en valeur', () => {
    const highlights = { '1': { '11': false, '14': true, '26': true }, '2': { '7': true } }
    expect(show(highlightParts(TEXT, 3, 1, highlights))).toBe('Monter {60} (<64>-[68]) m. puis [12] rangs')
    expect(show(highlightParts(TEXT, 3, 2, highlights))).toBe('Monter [60] ({64}-[68]) m. puis <12> rangs')
    // Sans taille reconnue : corrections « none »
    expect(show(highlightParts('Monter 64 m.', 0, null, { none: { '7': true } }))).toBe('Monter [64] m.')
  })

  it('bascule un nombre, et retire la correction qui revient au calcul', () => {
    const found = highlightParts(TEXT, 3, 1)
    const twelve = found.find((p) => p.text === '12')!
    let highlights = toggleHighlight({}, 1, twelve, 'plain')
    expect(highlights).toEqual({ '1': { '26': true } })
    highlights = toggleHighlight(highlights, 1, highlightParts(TEXT, 3, 1, highlights).find((p) => p.text === '12')!, 'plain')
    expect(highlights).toEqual({})
    const sixtyFour = found.find((p) => p.text === '64')!
    expect(toggleHighlight({ '2': { '7': true } }, 1, sixtyFour, 'chosen')).toEqual({ '2': { '7': true }, '1': { '11': false } })
  })

  it('ne garde que des corrections bien formées', () => {
    expect(sanitizeHighlights({ '1': { '11': false, x: true, '12': 'oui' }, none: { '3': true }, bad: { '1': true }, '2': [] })).toEqual({
      '1': { '11': false },
      none: { '3': true },
    })
    expect(sanitizeHighlights(null)).toEqual({})
    expect(sanitizeHighlights([1])).toEqual({})
  })
})

import { TEST_GLOSSARY } from '@/test/knitGlossary'
import { abbreviationParts, looksEnglish, mergeGlossary, sanitizeAbbreviations, sanitizeBaseGlossary, type TextPart } from './glossary'

const BASE_GLOSSARY = [...TEST_GLOSSARY.fr, ...TEST_GLOSSARY.en]

/** Abréviations reconnues entre [crochets]. */
const show = (parts: TextPart[]) => parts.map((p) => (p.kind === 'abbr' ? `[${p.text}]` : p.text)).join('')

describe('abréviations dans le texte', () => {
  it('repère les abréviations, les plus longues d’abord', () => {
    expect(show(abbreviationParts('Tricoter 2 m. ens. puis 3 m. end., 1 jeté.', BASE_GLOSSARY))).toBe('Tricoter [2 m. ens.] puis 3 [m. end.], 1 [jeté].')
    expect(show(abbreviationParts('k2tog, ssk, yo; p to end', BASE_GLOSSARY))).toBe('[k2tog], [ssk], [yo]; [p] to end')
    // Glossaire dans la langue du texte : « end. » n'est pas « endroit » dans un patron anglais
    expect(show(abbreviationParts('Knit to end.', mergeGlossary([], TEST_GLOSSARY, true)))).toBe('Knit to end.')
    expect(show(abbreviationParts('3 m. end.', mergeGlossary([], TEST_GLOSSARY, false)))).toBe('3 [m. end.]')
    expect(show(abbreviationParts('k2tog', mergeGlossary([], TEST_GLOSSARY, false)))).toBe('k2tog')
  })

  it('ne coupe pas un mot ni une taille', () => {
    // « M » est une taille, « k » dans « knit » n'est pas une abréviation
    expect(show(abbreviationParts('Taille M : knit until end', BASE_GLOSSARY))).toBe('Taille M : knit until end')
    expect(show(abbreviationParts('5 rgs et 6 rg', BASE_GLOSSARY))).toBe('5 [rgs] et 6 [rg]')
  })

  it('le glossaire du patron passe avant celui de base', () => {
    const glossary = mergeGlossary([{ abbr: 'ssk', meaning: 'Selon ce patron : surjet simple torse.' }, { abbr: 'C4F', meaning: 'Torsade de 4 mailles vers la gauche.' }], TEST_GLOSSARY)
    const parts = abbreviationParts('C4F, ssk', glossary)
    expect(parts.filter((p) => p.kind === 'abbr').map((p) => (p.kind === 'abbr' ? p.meaning : ''))).toEqual(['Torsade de 4 mailles vers la gauche.', 'Selon ce patron : surjet simple torse.'])
    expect(glossary.filter((a) => a.abbr === 'ssk')).toHaveLength(1)
  })

  it('texte vide ou glossaire vide', () => {
    expect(abbreviationParts('', BASE_GLOSSARY)).toEqual([])
    expect(abbreviationParts('k2tog', [])).toEqual([{ kind: 'text', text: 'k2tog' }])
  })
})

describe('patron en anglais', () => {
  it('reconnaît un texte anglais', () => {
    expect(looksEnglish('Row 1 (RS): Knit to end. Row 2: Purl.')).toBe(true)
    expect(looksEnglish('Rang 1 : tricoter à l’endroit jusqu’au bout.')).toBe(false)
  })
})

describe('abréviations lues en base', () => {
  it('garde celles bien formées', () => {
    expect(sanitizeAbbreviations([{ abbr: 'ssk', meaning: 'Surjet.' }, { abbr: ' ', meaning: 'x' }, { abbr: 'yo' }, 3])).toEqual([{ abbr: 'ssk', meaning: 'Surjet.' }])
    expect(sanitizeAbbreviations(null)).toEqual([])
  })

  it('glossaire de base : par langue', () => {
    expect(sanitizeBaseGlossary({ fr: [{ abbr: 'rg', meaning: 'Rang.' }, 4], en: 'x' })).toEqual({ fr: [{ abbr: 'rg', meaning: 'Rang.' }], en: [] })
    expect(sanitizeBaseGlossary(null)).toEqual({ fr: [], en: [] })
  })
})

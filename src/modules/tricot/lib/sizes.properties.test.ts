// Surlignage de la taille : invariants sur des textes de patron fabriqués au hasard (nombres, listes de tailles,
// abréviations collées comme « k2tog » ou « C4F », décimales, parenthèses).
import { highlightParts, sizedParts, toggleHighlight } from './sizes'

function rng(seed: number) {
  let x = seed
  return (n: number) => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x >>> 8) % n
  }
}

const WORDS = ['Monter', 'tricoter', 'rangs', 'm.', 'cm', 'k2tog', 'C4F', 'R2', 'ssk', 'puis', 'aiguilles', 'fois', '1/2', 'tour', '–', '(', ')', '[', ']', ',', 'k', 'p']

/** Texte au hasard : mots, nombres seuls, listes de tailles avec ou sans parenthèses, nombres collés à des lettres. */
function randomText(rand: (n: number) => number, sizes: number): string {
  const num = () => (rand(4) === 0 ? `${rand(10)},${rand(10)}` : String(1 + rand(120)))
  const pieces: string[] = []
  for (let i = 0, n = 3 + rand(12); i < n; i++) {
    const kind = rand(5)
    // Parfois collé à une abréviation : « k2 (3-4) » n'est pas un groupe de tailles
    if (kind === 0) pieces.push(`${rand(3) === 0 ? 'k' : ''}${num()} (${Array.from({ length: sizes - 1 }, num).join(['-', '/', ', '][rand(3)])})`)
    else if (kind === 1) pieces.push(Array.from({ length: sizes }, num).join(['/', '-'][rand(2)]))
    else if (kind === 2) pieces.push(`${WORDS[rand(WORDS.length)]}${num()}`)
    else if (kind === 3) pieces.push(num())
    else pieces.push(WORDS[rand(WORDS.length)]!)
  }
  return pieces.join(rand(3) === 0 ? '\n' : ' ')
}

describe('surlignage des tailles : invariants sur 500 textes au hasard', () => {
  it('le texte est rendu tel quel ; au plus un nombre choisi par groupe ; jamais un chiffre collé à une lettre', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = rng(seed)
      const sizes = 2 + rand(4)
      const index = rand(sizes)
      const text = randomText(rand, sizes)
      const parts = sizedParts(text, sizes, index)
      expect(parts.map((p) => p.text).join(''), `graine ${seed}`).toBe(text)
      let at = 0
      for (const p of parts) {
        if (p.kind === 'size') expect(/\p{L}$/u.test(text.slice(0, at)), `graine ${seed} : « ${text} »`).toBe(false)
        at += p.text.length
      }
      // Les nombres d'un groupe sont `sizes` à la suite : un seul est choisi parmi eux
      const sized = parts.filter((p) => p.kind === 'size')
      expect(sized.length % sizes, `graine ${seed} : « ${text} »`).toBe(0)
      for (let g = 0; g < sized.length; g += sizes) {
        const group = sized.slice(g, g + sizes)
        expect(group.filter((p) => p.chosen).length, `graine ${seed}`).toBe(1)
        expect(group.findIndex((p) => p.chosen), `graine ${seed}`).toBe(index)
      }
    }
  })

  it('positions des nombres : chaque morceau est bien à sa place, dans l’ordre ; corriger deux fois revient au départ', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = rng(seed)
      const sizes = 2 + rand(4)
      const index = rand(sizes)
      const text = randomText(rand, sizes)
      const parts = highlightParts(text, sizes, index)
      expect(parts.map((p) => p.text).join(''), `graine ${seed}`).toBe(text)
      let last = -1
      for (const p of parts.filter((x) => x.kind === 'number')) {
        expect(text.slice(p.start, p.start + p.text.length), `graine ${seed}`).toBe(p.text)
        expect(p.start, `graine ${seed}`).toBeGreaterThan(last)
        last = p.start
      }
      const numbers = parts.filter((x) => x.kind === 'number')
      if (!numbers.length) continue
      const target = numbers[rand(numbers.length)]!
      const once = toggleHighlight({}, index, target, target.state)
      const twice = toggleHighlight(once, index, highlightParts(text, sizes, index, once).find((p) => p.start === target.start)!, target.state)
      expect(highlightParts(text, sizes, index, twice), `graine ${seed}`).toEqual(parts)
    }
  })
})

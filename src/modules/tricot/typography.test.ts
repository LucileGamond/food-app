// Règle typographique du module Tricot (voir index.css, knit-name) : les noms du tricot et les grands nombres sont en
// Fraunces, par la seule classe knit-name ; le reste de l'interface en Geist.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname)

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f)
    if (statSync(path).isDirectory()) return files(path)
    return f.endsWith('.tsx') && !f.endsWith('.test.tsx') ? [path] : []
  })
}

/** Éléments JSX (className littéral) qui affichent directement un nom : {p.title}, {step.title}… (les titres h1-h3 sont déjà en Fraunces par index.css). */
const NAME = /<(span|p|div|h[1-6])\s+className="([^"]*)"[^>]*>\s*\{[\w.]*\.(title|name)\}/g
/** Grands nombres et grands messages. */
const BIG = /className="([^"]*\btext-(xl|2xl|3xl|4xl)\b[^"]*)"/g

describe('typographie du module Tricot', () => {
  const sources = files(ROOT).map((path) => ({ path: path.slice(ROOT.length + 1), text: readFileSync(path, 'utf8') }))

  it('écrit chaque nom du tricot avec knit-name (Fraunces), jamais en gras Geist', () => {
    const wrong = sources.flatMap(({ path, text }) =>
      [...text.matchAll(NAME)].filter((m) => !m[2]!.includes('knit-name') && /font-(medium|semibold|bold)/.test(m[2]!)).map((m) => `${path} : ${m[0]}`),
    )
    expect(wrong).toEqual([])
  })

  it('écrit les grands nombres et messages en knit-name (ou dans un titre h1-h3, déjà en Fraunces)', () => {
    const wrong = sources.flatMap(({ path, text }) =>
      [...text.matchAll(BIG)]
        .filter((m) => !m[1]!.includes('knit-name'))
        .filter((m) => !/<h[1-3][^>]*$/.test(text.slice(Math.max(0, m.index! - 120), m.index!)))
        .map((m) => `${path} : ${m[0]}`),
    )
    expect(wrong).toEqual([])
  })

  it('n’applique pas Fraunces à la main (font-tricot, font-variation-settings)', () => {
    const wrong = sources.filter(({ text }) => /font-tricot|font-variation-settings/.test(text)).map(({ path }) => path)
    expect(wrong).toEqual([])
  })
})

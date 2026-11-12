// Cohérence des réorganisations : séparer puis regrouper rend l'étape d'origine, déplacer puis remettre aussi, et après
// n'importe quelle suite d'opérations, aucun rang ne se perd et chaque étape a le nombre de rangs de ses sous-étapes.
import { mergeSteps } from './merge'
import { moveSection, sectionLength, splitStep } from './organize'
import { planSections, type StepSection } from './pattern'

const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })
const repeat = (every: number, times: number, text: string): StepSection => ({ kind: 'repeat', rows: null, every, times, actions: [{ text, rank: null }], text: '', pattern: null })

type Step = { id: string; title: string; totalRows: number | null; sections: StepSection[] }

/** Fin de la dernière sous-étape (rangs de l'étape d'après ses sous-étapes). */
const planEnd = (sections: StepSection[]) => Math.max(0, ...planSections(sections, null).map((p) => p.end ?? NaN))
const allRows = (steps: Step[]) => steps.flatMap((s) => s.sections).reduce((sum, s) => sum + (sectionLength(s) ?? 0), 0)
const texts = (steps: Step[]) => steps.flatMap((s) => s.sections.map((x) => x.text || x.actions?.[0]?.text)).sort()

// Générateur pseudo-aléatoire reproductible
function rng(seed: number) {
  let x = seed
  return (n: number) => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x >>> 8) % n
  }
}

function randomProject(rand: (n: number) => number): Step[] {
  return Array.from({ length: 2 + rand(4) }, (_, i) => {
    const sections = Array.from({ length: 1 + rand(4) }, (_, j) => (rand(2) ? rows(1 + rand(30), `r${i}.${j}`) : repeat(1 + rand(6), 1 + rand(8), `a${i}.${j}`)))
    return { id: `s${i}`, title: `Étape ${i}`, totalRows: planEnd(sections), sections }
  })
}

describe('cohérence des réorganisations', () => {
  const back: Step = { id: 'b', title: 'Dos', totalRows: 66, sections: [rows(18, 'côtes'), repeat(6, 4, '1 aug.'), rows(24, 'jersey')] }

  it('séparer puis regrouper rend l’étape d’origine, quel que soit l’endroit', () => {
    for (let index = 1; index < back.sections.length; index++) {
      const { first, second } = splitStep(back, index)
      expect(first.totalRows! + second.totalRows!).toBe(66)
      expect(mergeSteps({ ...back, ...first }, { ...second })).toEqual({ sections: back.sections, totalRows: 66 })
    }
  })

  it('séparer puis regrouper garde le début « en même temps » au même rang', () => {
    const neck: StepSection = { ...repeat(2, 3, 'encolure'), at: { row: 50, pattern: null } }
    const step = { ...back, sections: [...back.sections, neck] }
    const { first, second } = splitStep(step, 2)
    expect(second.sections[1]!.at).toEqual({ row: 8, pattern: null })
    expect(mergeSteps({ ...step, ...first }, second).sections).toEqual(step.sections)
  })

  it('regrouper puis séparer au même endroit rend les deux étapes', () => {
    const sleeve: Step = { id: 's', title: 'Manche', totalRows: 40, sections: [rows(10, 'côtes'), repeat(5, 6, '1 aug.')] }
    const merged = mergeSteps(back, sleeve)
    const { first, second } = splitStep({ ...back, ...merged }, back.sections.length)
    expect(first).toEqual({ sections: back.sections, totalRows: 66 })
    expect([second.sections, second.totalRows]).toEqual([sleeve.sections, 40])
  })

  it('déplacer puis remettre : les rangs reviennent', () => {
    const sleeve: Step = { id: 's', title: 'Manche', totalRows: 40, sections: [rows(40, 'côtes')] }
    const [from, to] = moveSection(back, 1, sleeve)
    const [back2, from2] = moveSection({ ...sleeve, ...to }, 1, { ...back, ...from })
    expect([from2.totalRows, back2.totalRows]).toEqual([66, 40])
    expect(back2.sections).toEqual(sleeve.sections)
  })

  it('après 200 suites d’opérations au hasard : aucun rang perdu, chaque étape au nombre de rangs de ses sous-étapes', () => {
    const done = { merge: 0, split: 0, move: 0 }
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed)
      let steps = randomProject(rand)
      const before = { rows: allRows(steps), texts: texts(steps) }
      for (let op = 0; op < 30; op++) {
        const i = rand(steps.length)
        const step = steps[i]!
        const kind = rand(3)
        if (kind === 0 && i + 1 < steps.length) {
          steps = [...steps.slice(0, i), { ...step, ...mergeSteps(step, steps[i + 1]!) }, ...steps.slice(i + 2)]
          done.merge++
        } else if (kind === 1 && step.sections.length > 1) {
          const { first, second } = splitStep(step, 1 + rand(step.sections.length - 1))
          steps = [...steps.slice(0, i), { ...step, ...first }, { id: `${step.id}+${op}`, ...second }, ...steps.slice(i + 1)]
          done.split++
        } else if (kind === 2 && step.sections.length > 1 && steps.length > 1) {
          const j = (i + 1 + rand(steps.length - 1)) % steps.length
          const [from, to] = moveSection(step, rand(step.sections.length), steps[j]!)
          steps = steps.map((s) => (s.id === from.id ? { ...s, ...from } : s.id === to.id ? { ...s, ...to } : s))
          done.move++
        }
        for (const s of steps) expect(s.totalRows, `graine ${seed}, opération ${op}, ${s.id}`).toBe(planEnd(s.sections))
      }
      expect(allRows(steps)).toBe(before.rows)
      expect(texts(steps)).toEqual(before.texts)
    }
    // Les trois opérations ont bien été essayées, souvent
    expect(Math.min(done.merge, done.split, done.move)).toBeGreaterThan(200)
  })
})

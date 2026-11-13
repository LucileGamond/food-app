// Cohérence des réorganisations : séparer puis regrouper rend l'étape d'origine, déplacer puis remettre aussi, et après
// n'importe quelle suite d'opérations, aucun rang ne se perd et chaque étape a le nombre de rangs de ses sous-étapes.
import { mergeSteps } from './merge'
import { moveSection, sectionLength, splitStep } from './organize'
import { planSections, type StepSection } from './pattern'
import { textOf } from './sources'

const rows = (n: number, text: string): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null })
const repeat = (every: number, times: number, text: string): StepSection => ({ kind: 'repeat', rows: null, every, times, actions: [{ text, rank: null }], text: '', pattern: null })

type Step = { id: string; title: string; totalRows: number | null; sections: StepSection[]; instructions: string }

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

/** Projet au hasard : la moitié des étapes ont leur texte par sous-étape, les autres (anciens projets) sur l'étape seulement. */
function randomProject(rand: (n: number) => number): Step[] {
  return Array.from({ length: 2 + rand(4) }, (_, i) => {
    const sections = Array.from({ length: 1 + rand(4) }, (_, j) => (rand(2) ? rows(1 + rand(30), `r${i}.${j}`) : repeat(1 + rand(6), 1 + rand(8), `a${i}.${j}`)))
    if (rand(2)) return { id: `s${i}`, title: `Étape ${i}`, totalRows: planEnd(sections), sections, instructions: `Texte de l’étape ${i}.` }
    const sourced = sections.map((x, j) => ({ ...x, source: `Paragraphe ${i}.${j}.`, id: `id${i}.${j}` }))
    return { id: `s${i}`, title: `Étape ${i}`, totalRows: planEnd(sourced), sections: sourced, instructions: textOf(sourced) }
  })
}

/** Tous les paragraphes du projet : ceux des étapes sans texte par sous-étape, et ceux des sous-étapes. */
/** Identifiants des sous-étapes (diagrammes rattachés) : aucun perdu ni dupliqué. */
const ids = (steps: Step[]) => steps.flatMap((s) => s.sections.flatMap((x) => (x.id ? [x.id] : []))).sort()
const paragraphs = (steps: Step[]) => steps.flatMap((s) => (s.sections.some((x) => x.source) ? s.sections.flatMap((x) => (x.source ? x.source.split('\n\n') : [])) : s.instructions ? [s.instructions] : [])).sort()

describe('cohérence des réorganisations', () => {
  const back: Step = { id: 'b', title: 'Dos', instructions: '', totalRows: 66, sections: [rows(18, 'côtes'), repeat(6, 4, '1 aug.'), rows(24, 'jersey')] }

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
    const sleeve: Step = { id: 's', title: 'Manche', instructions: '', totalRows: 40, sections: [rows(10, 'côtes'), repeat(5, 6, '1 aug.')] }
    const merged = mergeSteps(back, sleeve)
    const { first, second } = splitStep({ ...back, ...merged }, back.sections.length)
    expect(first).toEqual({ sections: back.sections, totalRows: 66, instructions: '' })
    expect([second.sections, second.totalRows]).toEqual([sleeve.sections, 40])
  })

  it('déplacer puis remettre : les rangs reviennent', () => {
    const sleeve: Step = { id: 's', title: 'Manche', instructions: '', totalRows: 40, sections: [rows(40, 'côtes')] }
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
      const before = { rows: allRows(steps), texts: texts(steps), paragraphs: paragraphs(steps), ids: ids(steps) }
      for (let op = 0; op < 30; op++) {
        const i = rand(steps.length)
        const step = steps[i]!
        const kind = rand(3)
        if (kind === 0 && i + 1 < steps.length) {
          // Comme en base : textes mis bout à bout
          const instructions = [step.instructions, steps[i + 1]!.instructions].filter(Boolean).join('\n\n')
          steps = [...steps.slice(0, i), { ...step, ...mergeSteps(step, steps[i + 1]!), instructions }, ...steps.slice(i + 2)]
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
        for (const s of steps) {
          expect(s.totalRows, `graine ${seed}, opération ${op}, ${s.id}`).toBe(planEnd(s.sections))
          // Le texte de l'étape est celui de ses sous-étapes, dès qu'elles en portent
          if (s.sections.some((x) => x.source)) expect(s.instructions, `graine ${seed}, opération ${op}, ${s.id}`).toBe(textOf(s.sections))
        }
      }
      expect(allRows(steps)).toBe(before.rows)
      expect(texts(steps)).toEqual(before.texts)
      // Aucun paragraphe perdu ni dupliqué
      expect(paragraphs(steps), `graine ${seed}`).toEqual(before.paragraphs)
      // Chaque sous-étape garde son identifiant : les diagrammes qui la suivent la retrouvent
      expect(ids(steps), `graine ${seed}`).toEqual(before.ids)
    }
    // Les trois opérations ont bien été essayées, souvent
    expect(Math.min(done.merge, done.split, done.move)).toBeGreaterThan(200)
  })
})

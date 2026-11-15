// Organiser avec des sous-étapes « en même temps » : chaque sous-étape garde le rang où elle se tricote.
// Regrouper décale exactement la seconde étape des rangs de la première ; séparer ne coupe qu'entre deux sous-étapes
// qui ne se chevauchent pas ; déplacer une sous-étape ne décale pas celles qui restent.
import { mergeBlocker, mergeSteps } from './merge'
import { moveSection, splitBlocker, splitStep } from './organize'
import { MAX_SECTIONS, planSections, type StepSection } from './pattern'

const rows = (n: number, text: string, at?: StepSection['at']): StepSection => ({ kind: 'rows', rows: n, every: null, times: null, text, pattern: null, id: text, ...(at ? { at } : {}) })
const repeat = (every: number, times: number, text: string, at?: StepSection['at']): StepSection => ({
  kind: 'repeat',
  rows: null,
  every,
  times,
  actions: [{ text, rank: null }],
  text: '',
  pattern: null,
  id: text,
  ...(at ? { at } : {}),
})
const at = (row: number) => ({ row, pattern: null })

type Step = { id: string; title: string; totalRows: number | null; sections: StepSection[]; instructions: string }
const step = (id: string, totalRows: number | null, sections: StepSection[]): Step => ({ id, title: id, totalRows, sections, instructions: '' })

/** Premier et dernier rang de chaque sous-étape, par identifiant. */
function spans(s: Pick<Step, 'sections' | 'totalRows'>, offset = 0): Record<string, [number | null, number | null]> {
  return Object.fromEntries(
    planSections(s.sections, s.totalRows).map((p) => [p.section.id!, [p.start === null ? null : p.start + offset, p.end === null ? null : p.end + offset]]),
  )
}

describe('regrouper : la suite garde ses rangs', () => {
  it('la première étape a plus de rangs que ses sous-étapes : la suite commence après son dernier rang', () => {
    const first = step('a', 40, [rows(30, 'côtes')])
    const second = step('b', 20, [rows(10, 'jersey'), rows(10, 'fin', at(5))])
    const merged = mergeSteps(first, second)
    expect(merged.totalRows).toBe(60)
    expect(spans(merged)).toEqual({ ...spans(first), ...spans(second, 40) })
  })

  it('la première étape finit par un « en même temps » : la suite ne repart pas de lui', () => {
    const first = step('a', 40, [rows(40, 'dos'), rows(20, 'encolure', at(10))])
    const second = step('b', 10, [rows(10, 'épaules')])
    const merged = mergeSteps(first, second)
    expect(spans(merged)).toEqual({ ...spans(first), ...spans(second, 40) })
  })

  it('refusé si la première étape est terminée, ou si les deux ne se tricotent pas le même nombre de fois', () => {
    const fresh = { rowCount: 0, done: false, pass: 1, times: 1, totalRows: 10, sections: [] }
    expect(mergeBlocker(fresh, fresh, false)).toBeNull()
    expect(mergeBlocker({ ...fresh, done: true }, fresh, false)).toContain('terminée')
    expect(mergeBlocker(fresh, { ...fresh, times: 2 }, false)).toContain('fois')
  })

  it(`refusé au-delà de ${MAX_SECTIONS} sous-étapes ou de 2000 rangs`, () => {
    const fresh = { rowCount: 0, done: false, pass: 1, times: 1, totalRows: 10 }
    const many = (n: number) => Array.from({ length: n }, (_, i) => rows(1, `r${i}`))
    expect(mergeBlocker({ ...fresh, sections: many(20) }, { ...fresh, sections: many(10) }, false)).toBeNull()
    expect(mergeBlocker({ ...fresh, sections: many(20) }, { ...fresh, sections: many(11) }, false)).toContain(`${MAX_SECTIONS}`)
    expect(mergeBlocker({ ...fresh, sections: [], totalRows: 1500 }, { ...fresh, sections: [], totalRows: 600 }, false)).toContain('2000')
  })
})

describe('séparer : jamais au milieu d’une sous-étape', () => {
  it('sur un « en même temps » qui commence pendant la précédente : refusé', () => {
    const back = step('dos', 40, [rows(40, 'dos'), repeat(4, 5, 'emmanchures', at(10))])
    expect(splitBlocker(back, 1)).toContain('pendant')
    // Ce que le calcul faisait avant : 9 + 31 rangs, ceux de « dos » comptés deux fois
  })

  it('« en même temps » au 1er rang : rien ne resterait avant', () => {
    expect(splitBlocker(step('x', 20, [rows(20, 'a'), rows(20, 'b', at(1))]), 1)).toContain('1er rang')
  })

  it('entre deux sous-étapes à la suite : permis, et chaque sous-étape garde son rang', () => {
    const back = step('dos', 50, [rows(10, 'côtes'), repeat(4, 5, 'aug'), rows(20, 'jersey'), rows(6, 'encolure', at(35))])
    expect(splitBlocker(back, 2)).toBeNull()
    const { first, second } = splitStep(back, 2)
    expect(first.totalRows! + second.totalRows!).toBe(50)
    expect({ ...spans(first), ...spans(second, first.totalRows!) }).toEqual(spans(back))
  })
})

describe('déplacer : les sous-étapes qui restent ne bougent pas', () => {
  const sleeve = step('manche', 30, [rows(30, 'manche')])

  it('« en même temps » d’après recalé quand on retire des rangs avant lui', () => {
    const from = step('dos', 40, [rows(10, 'côtes'), rows(30, 'jersey'), rows(5, 'poche', at(25))])
    const [rest] = moveSection(from, 0, sleeve)
    // La poche était au rang 15 du jersey : elle y reste
    expect(spans(rest)).toEqual({ jersey: [1, 30], poche: [15, 19] })
    expect(rest.totalRows).toBe(30)
  })

  it('« en même temps » commencé pendant la sous-étape retirée : à régler', () => {
    const from = step('dos', 40, [rows(10, 'côtes'), rows(30, 'jersey'), rows(5, 'poche', at(5))])
    const [rest] = moveSection(from, 0, sleeve)
    expect(rest.sections[1]!.at).toMatchObject({ row: null })
  })

  it('le début d’une piste « en même temps » retiré : la suite de la piste garde son rang', () => {
    const from = step('col', 25, [rows(25, 'raglan'), rows(1, 'attente', at(15)), repeat(2, 2, 'encolure')])
    const [rest] = moveSection(from, 1, sleeve)
    expect(spans(rest)).toEqual({ raglan: [1, 25], encolure: [16, 19] })
  })

  it('ajoutée à une étape dont les sous-étapes finissent avant elle : après son dernier rang', () => {
    const to = step('manche', 40, [rows(30, 'manche')])
    const [, target] = moveSection(step('dos', 50, [rows(10, 'côtes'), rows(40, 'jersey')]), 0, to)
    expect(spans(target)).toEqual({ manche: [1, 30], côtes: [41, 50] })
    expect(target.totalRows).toBe(50)
  })
})

// Générateur pseudo-aléatoire reproductible
function rng(seed: number) {
  let x = seed
  return (n: number) => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return (x >>> 8) % n
  }
}

/** Étape au hasard, avec parfois des pistes « en même temps », et parfois plus de rangs que ses sous-étapes. */
function randomStep(rand: (n: number) => number, name: string): Step {
  const sections: StepSection[] = []
  for (let j = 0, n = 1 + rand(5); j < n; j++) {
    const id = `${name}.${j}`
    const start = j > 0 && rand(3) === 0 ? at(1 + rand(20)) : undefined
    sections.push(rand(2) ? rows(1 + rand(20), id, start) : repeat(1 + rand(4), 1 + rand(6), id, start))
  }
  const end = Math.max(...planSections(sections, null).map((p) => p.end!))
  return step(name, end + (rand(3) === 0 ? rand(10) : 0), sections)
}

describe('propriétés, sur 300 étapes au hasard avec des « en même temps »', () => {
  it('regrouper : la première garde ses rangs, la seconde est décalée exactement des rangs de la première', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed)
      const a = randomStep(rand, 'a')
      const b = randomStep(rand, 'b')
      const merged = mergeSteps(a, b)
      expect(merged.totalRows, `graine ${seed}`).toBe(a.totalRows! + b.totalRows!)
      expect(spans(merged), `graine ${seed}`).toEqual({ ...spans(a), ...spans(b, a.totalRows!) })
    }
  })

  it('séparer, quand c’est permis : aucun rang perdu ni doublé, chaque sous-étape au même rang, regrouper rend l’étape', () => {
    let allowed = 0
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed)
      const s = randomStep(rand, 's')
      for (let index = 1; index < s.sections.length; index++) {
        if (splitBlocker(s, index)) continue
        allowed++
        const { first, second } = splitStep(s, index)
        expect(first.totalRows! + second.totalRows!, `graine ${seed}`).toBe(s.totalRows)
        for (const part of [first, second]) {
          for (const p of planSections(part.sections, part.totalRows)) expect(p.end!, `graine ${seed}`).toBeLessThanOrEqual(part.totalRows!)
        }
        expect({ ...spans(first), ...spans(second, first.totalRows!) }, `graine ${seed}`).toEqual(spans(s))
        expect(spans(mergeSteps({ ...s, ...first }, { ...s, ...second })), `graine ${seed}`).toEqual(spans(s))
      }
    }
    expect(allowed).toBeGreaterThan(100)
  })

  it('déplacer : les sous-étapes qui restent gardent leur rang ou deviennent à régler ; la déplacée vient après la fin de l’autre étape', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed)
      const from = randomStep(rand, 'f')
      const to = randomStep(rand, 't')
      const index = rand(from.sections.length)
      const [rest, target] = moveSection(from, index, to)
      const before = spans(from)
      const moved = planSections(from.sections, from.totalRows)[index]!
      const sequential = !from.sections[index]!.at && from.sections.slice(0, index).every((x) => !x.at)
      const length = sequential ? moved.end! - moved.start! + 1 : 0
      // Vérifié pour la piste principale et les débuts de piste (la suite d'une piste « en même temps » suit son début)
      const checked = new Set(from.sections.filter((x, i) => x.at || from.sections.slice(0, i + 1).every((y) => !y.at)).map((x) => x.id!))
      for (const [id, [start]] of Object.entries(spans(rest))) {
        if (start === null || !checked.has(id)) continue
        const [old] = before[id]!
        expect(start, `graine ${seed}, ${id}`).toBe(old! > moved.end! ? old! - length : old)
      }
      expect(spans(target)[from.sections[index]!.id!]?.[0] ?? null, `graine ${seed}`).toBe(from.sections[index]!.at ? null : to.totalRows! + 1)
      expect({ ...spans(target), [from.sections[index]!.id!]: undefined }, `graine ${seed}`).toEqual({ ...spans(to), [from.sections[index]!.id!]: undefined })
    }
  })
})

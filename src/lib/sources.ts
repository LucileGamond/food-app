import { normalizeName } from './shopping'

/**
 * Sources existantes, sans doublon : les libellés qui ne diffèrent que par la casse, les accents ou les espaces
 * (« Pâtisserie maison », « patisserie  maison ») n'en font qu'un, sous l'écriture la plus utilisée. Triées par nom.
 */
export function groupSources(labels: readonly string[]): string[] {
  const groups = new Map<string, Map<string, number>>()
  for (const raw of labels) {
    const label = raw.trim().replace(/\s+/g, ' ')
    if (!label) continue
    const key = normalizeName(label)
    const spellings = groups.get(key) ?? new Map<string, number>()
    spellings.set(label, (spellings.get(label) ?? 0) + 1)
    groups.set(key, spellings)
  }
  return [...groups.values()]
    .map((spellings) => [...spellings].sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'fr', { caseFirst: 'upper' }))[0]![0])
    .sort((a, b) => a.localeCompare(b, 'fr'))
}

/** Source existante qui correspond au texte saisi (même nom à la casse et aux accents près), sinon null. */
export function findSource(text: string, sources: readonly string[]): string | null {
  const key = normalizeName(text)
  return key ? (sources.find((s) => normalizeName(s) === key) ?? null) : null
}

/** Sources qui contiennent le texte saisi (casse et accents ignorés) ; toutes si rien n'est saisi. */
export function filterSources(text: string, sources: readonly string[]): string[] {
  const key = normalizeName(text)
  return key ? sources.filter((s) => normalizeName(s).includes(key)) : [...sources]
}

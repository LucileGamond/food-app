import { splitUnit } from '@/lib/units'
import { signedInApi } from './helpers'

// L'application (src/lib/units.ts) et la base (split_unit) doivent reconnaître les unités de la même façon.
const SAMPLES = [
  'g', 'Grammes', 'kg', 'cl', 'L', 'cuillère à soupe', 'Cuillères à Soupe', 'CàS', 'c. à s. bombée(s)', 'c. à c. rase', 'cc',
  'tbsp', 'teaspoons', 'petite cuillère', 'petit morceau', 'gros morceaux', 'poignées', 'pincée', 'gousses', 'boite', 'Boîtes',
  'brins', 'feuilles', 'verre', 'tasse', 'cup', 'bol', 'noix', 'filet', 'pièce', 'pluche', '1 shot', 'sachet de levure', '',
]

describe('unités : application et base alignées', () => {
  it.each(SAMPLES)('« %s »', async (raw) => {
    const { db } = await signedInApi()
    const { data, error } = await db.rpc('split_unit', { p_unit: raw })
    expect(error).toBeNull()
    const row = data as unknown as { recognized: boolean; unit: string | null; rest: string | null }
    const expected = splitUnit(raw)
    expect(row.recognized).toBe(expected !== null)
    if (expected) expect({ unit: row.unit, rest: row.rest }).toEqual(expected)
  })
})

import { createHandler } from './handler.ts'
import { parseIdeasInput, sanitizeIdeas } from './ideas.ts'

const IDEAS = {
  ideas: [
    { title: 'Bonnet à côtes 2/2', why: 'Tient dans 150 m de laine moyenne.', meters: 150.4, needle_mm: 4, search: 'ribbed beanie worsted' },
    { title: 'Snood', why: 'Doux en mérinos.', meters: null, needle_mm: 80, search: 'cowl' },
    { title: '', why: 'sans titre', meters: 10, needle_mm: 3, search: '' },
  ],
}

describe('idées pour une laine', () => {
  it('lit la demande', () => {
    expect(parseIdeasInput({ pdf: 'x' })).toBeNull()
    expect(parseIdeasInput({ ideas: { yarn: ' Mérinos, 50 g / 125 m ', meters: 750, needle_mm: 3.5 } })).toEqual({ yarn: 'Mérinos, 50 g / 125 m', meters: 750, needleMm: 3.5 })
    expect(parseIdeasInput({ ideas: { yarn: 'Mérinos', meters: -2, needle_mm: 'gros' } })).toEqual({ yarn: 'Mérinos', meters: null, needleMm: null })
    expect(() => parseIdeasInput({ ideas: { yarn: '' } })).toThrow('Décris la laine.')
  })

  it('garde les idées valides, bornées', () => {
    expect(sanitizeIdeas(IDEAS)).toEqual([
      { title: 'Bonnet à côtes 2/2', why: 'Tient dans 150 m de laine moyenne.', meters: 150, needleMm: 4, search: 'ribbed beanie worsted' },
      { title: 'Snood', why: 'Doux en mérinos.', meters: null, needleMm: null, search: 'cowl' },
    ])
    expect(() => sanitizeIdeas({ ideas: [] })).toThrow('Aucune idée trouvée pour cette laine.')
  })

  it('le handler propose des idées à une personne connectée', async () => {
    const fetchModel = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'proposer_modeles', input: IDEAS }], usage: { input_tokens: 300, output_tokens: 200 } })),
    )
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true })
    const response = await handle(new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify({ ideas: { yarn: 'Mérinos', meters: 750, needle_mm: 3.5 } }) }))
    expect(response.status).toBe(200)
    expect((await response.json()).ideas).toHaveLength(2)
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content[0].text).toBe('Laine : Mérinos\nQuantité disponible : 750 m\nAiguilles conseillées : 3.5 mm')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ ideas: 2 }))
  })
})

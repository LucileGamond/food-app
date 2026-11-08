import { createHandler } from './handler.ts'
import { ADAPT_TOOL, parseAdaptInput, sanitizeAdapted } from './adapt.ts'

const reply = (name: string, input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 400, output_tokens: 120 } }), { status: 200 })

function handler(response: Response) {
  const fetchModel = vi.fn<typeof fetch>(async () => response)
  const log = vi.fn()
  return { handle: createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true }), fetchModel, log }
}

const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

const SLEEVE = {
  title: 'Manches',
  instructions: 'Monter 48 m. Augmenter 1 m. de chaque côté tous les 8 rangs, 6 fois.',
  total_rows: 120,
  stitches: 60,
  sections: [{ kind: 'repeat', rows: null, every: 8, times: 6, actions: [{ text: '1 augmentation de chaque côté', rank: null }], text: '', pattern: null }],
}
const BODY = { adapt: { request: '5 cm de plus aux manches', size: 'M', pattern_gauge: { stitches: 22, rows: 30 }, my_gauge: { stitches: 24, rows: 30.5 }, steps: [{ title: 'Dos', instructions: '', total_rows: 100, stitches: 88, sections: [] }, SLEEVE] } }

describe('patron adapté', () => {
  it('lit la demande : retouches, échantillons, étapes', () => {
    expect(parseAdaptInput({ pdf: 'x' })).toBeNull()
    const input = parseAdaptInput(BODY)!
    expect(input.request).toBe('5 cm de plus aux manches')
    expect(input.myGauge).toEqual({ stitches: 24, rows: 30.5 })
    expect(input.steps[1]).toMatchObject({ title: 'Manches', totalRows: 120, stitches: 60 })
    expect(input.steps[1]!.sections).toHaveLength(1)
    // Échantillon seul (sans retouche) : accepté
    expect(parseAdaptInput({ adapt: { ...BODY.adapt, request: '' } })!.request).toBe('')
    expect(() => parseAdaptInput({ adapt: { ...BODY.adapt, steps: [] } })).toThrow('Aucune étape à adapter.')
    expect(() => parseAdaptInput({ adapt: { ...BODY.adapt, request: ' ', my_gauge: { stitches: null, rows: null } } })).toThrow('Indique ton échantillon')
  })

  it('garde les étapes adaptées bien formées, une fois chacune', () => {
    const section = { kind: 'rows', rows: 6, every: null, times: null, actions: [], text: 'jersey', pattern: null }
    expect(
      sanitizeAdapted(
        {
          steps: [
            { index: 1, total_rows: 136, stitches: 66, sections: [section, { kind: 'autre' }], note: '16 rangs de plus pour 5 cm.' },
            { index: 1, total_rows: 1, stitches: 1, sections: [], note: 'doublon' },
            { index: 7, total_rows: 10, stitches: 10, sections: [], note: 'hors liste' },
            { index: 0, total_rows: 0, stitches: 'beaucoup', sections: 'non', note: 3 },
          ],
        },
        2,
      ),
    ).toEqual([
      { index: 1, totalRows: 136, stitches: 66, sections: [section], note: '16 rangs de plus pour 5 cm.' },
      { index: 0, totalRows: null, stitches: null, sections: [], note: '' },
    ])
    expect(sanitizeAdapted(null, 2)).toEqual([])
    expect(ADAPT_TOOL.input_schema.required).toEqual(['steps'])
  })

  it('adapte avec les échantillons et les retouches en contexte', async () => {
    const { handle, fetchModel, log } = handler(reply('enregistrer_adaptation', { steps: [{ index: 1, total_rows: 136, stitches: 66, sections: [], note: '16 rangs de plus.' }] }))
    const response = await handle(post(BODY))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ steps: [{ index: 1, totalRows: 136, stitches: 66, sections: [], note: '16 rangs de plus.' }] })
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content).toContain('Échantillon de la tricoteuse : 24 mailles et 30.5 rangs pour 10 cm')
    expect(sent.messages[0].content).toContain('Retouches demandées : 5 cm de plus aux manches')
    expect(sent.messages[0].content).toContain('Étape 1 : Manches')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ adapt: true, steps: 2, changed: 1 }))
  })

  it('rien à changer : message lisible', async () => {
    const { handle } = handler(reply('enregistrer_adaptation', { steps: [] }))
    const response = await handle(post(BODY))
    expect(response.status).toBe(422)
    expect((await response.json()).error).toContain('Rien à changer')
  })
})

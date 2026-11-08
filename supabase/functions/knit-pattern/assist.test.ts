import { createHandler } from './handler.ts'
import { numbersOf, parseQuestionInput, parseTranslateInput } from './assist.ts'
import { sanitizeAbbreviations } from './pattern.ts'

const reply = (name: string, input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 200, output_tokens: 80 } }), { status: 200 })

function handler(response: Response) {
  const fetchModel = vi.fn<typeof fetch>(async () => response)
  const log = vi.fn()
  return { handle: createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true }), fetchModel, log }
}

const post = (body: unknown) => new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify(body) })

describe('question sur le rang', () => {
  it('lit la demande', () => {
    expect(parseQuestionInput({ pdf: 'x' })).toBeNull()
    expect(parseQuestionInput({ question: { question: ' Que veut dire ssk ? ', step_title: 'Dos', text: 'ssk, k2tog', row: 12, size: 'M', abbreviations: 'ssk : surjet' } })).toEqual({
      question: 'Que veut dire ssk ?',
      stepTitle: 'Dos',
      text: 'ssk, k2tog',
      row: 12,
      size: 'M',
      abbreviations: 'ssk : surjet',
    })
    expect(parseQuestionInput({ question: { question: 'Et ?', row: 0 } })).toMatchObject({ row: null, text: '', size: '' })
    expect(() => parseQuestionInput({ question: { question: ' ' } })).toThrow('Pose ta question.')
  })

  it('répond avec le texte de l’étape, la taille et le rang en contexte', async () => {
    const { handle, fetchModel, log } = handler(reply('repondre', { answer: 'Glisse 2 mailles une à une, puis tricote-les ensemble par le brin arrière.' }))
    const response = await handle(post({ question: { question: 'ssk ?', step_title: 'Dos', text: 'Rang 3 : 1 m., ssk', row: 3, size: 'M', abbreviations: 'ssk : surjet simple' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ answer: 'Glisse 2 mailles une à une, puis tricote-les ensemble par le brin arrière.' })
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content).toContain('Rang à tricoter dans l’étape : 3')
    expect(sent.messages[0].content).toContain('Taille suivie : M')
    expect(sent.messages[0].content).toContain('ssk : surjet simple')
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ question: true }))
  })

  it('refuse une réponse vide', async () => {
    const { handle } = handler(reply('repondre', { answer: ' ' }))
    const response = await handle(post({ question: { question: 'ssk ?' } }))
    expect(response.status).toBe(422)
    expect((await response.json()).error).toBe('Pas de réponse : reformule ta question.')
  })
})

describe('traduction', () => {
  it('lit la demande', () => {
    expect(parseTranslateInput({ pdf: 'x' })).toBeNull()
    expect(parseTranslateInput({ translate: { text: ' Knit 2 ' } })).toEqual({ text: 'Knit 2' })
    expect(() => parseTranslateInput({ translate: { text: '' } })).toThrow('Texte à traduire manquant.')
  })

  it('compare les nombres dans l’ordre', () => {
    expect(numbersOf('Cast on 60 (64-68) sts, 1.5 cm')).toEqual(['60', '64', '68', '1.5'])
    expect(numbersOf('Monter 60 (64-68) m., 1,5 cm')).toEqual(['60', '64', '68', '1.5'])
  })

  it('traduit en gardant les nombres, et prévient s’ils ont changé', async () => {
    const ok = handler(reply('enregistrer_traduction', { text: 'Monter 60 (64-68) m.' }))
    const response = await ok.handle(post({ translate: { text: 'Cast on 60 (64-68) sts.' } }))
    expect(await response.json()).toEqual({ text: 'Monter 60 (64-68) m.', numbersKept: true })
    const sent = JSON.parse(ok.fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.system).toContain('Garde exactement tous les nombres')
    expect(ok.log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ translate: true, numbersKept: true }))

    const changed = handler(reply('enregistrer_traduction', { text: 'Monter 64 m.' }))
    expect(await (await changed.handle(post({ translate: { text: 'Cast on 60 (64-68) sts.' } }))).json()).toEqual({ text: 'Monter 64 m.', numbersKept: false })

    const empty = handler(reply('enregistrer_traduction', { text: '' }))
    expect((await empty.handle(post({ translate: { text: 'Knit' } }))).status).toBe(502)
  })
})

describe('abréviations du patron', () => {
  it('garde les abréviations bien formées, une fois chacune', () => {
    expect(
      sanitizeAbbreviations([
        { abbr: 'ssk', meaning: 'Surjet simple.' },
        { abbr: 'ssk', meaning: 'Doublon.' },
        { abbr: '', meaning: 'Sans abréviation.' },
        { abbr: 'k2tog', meaning: '' },
        'x',
        { abbr: '2 m. ens.', meaning: 'Tricoter 2 mailles ensemble.' },
      ]),
    ).toEqual([
      { abbr: 'ssk', meaning: 'Surjet simple.' },
      { abbr: '2 m. ens.', meaning: 'Tricoter 2 mailles ensemble.' },
    ])
    expect(sanitizeAbbreviations(null)).toEqual([])
  })
})

import { API_URL, callTool, HttpError } from './anthropic.ts'
import { createModelHandler, type ModelDeps } from './handler.ts'

const TOOL = { name: 'repondre', description: 'Réponse', input_schema: { type: 'object' } }
const modelReply = () =>
  new Response(
    JSON.stringify({
      model: 'claude-haiku-5-5',
      content: [{ type: 'tool_use', name: 'repondre', input: { ok: true } }],
      usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 10 },
    }),
  )

type Input = { kind?: string; fail?: 'http' | 'boom' }

function setup(overrides: Partial<ModelDeps> = {}, mode?: (input: Input) => string | null) {
  const recordUsage = vi.fn(async () => {})
  const deps: ModelDeps = {
    apiKey: 'k',
    fetchModel: vi.fn<typeof fetch>(async () => modelReply()),
    isSignedIn: vi.fn(async (authorization: string | null) => (authorization === 'Bearer ok' ? 'u1' : null)),
    log: vi.fn(),
    recordUsage,
    ...overrides,
  }
  const handler = createModelHandler(deps, {
    parse: (body) => body as Input,
    ...(mode ? { mode } : {}),
    async run(input, options) {
      const { usage } = await callTool({ system: 's', tool: TOOL, message: 'm', maxTokens: 10, failure: 'Échec', missing: 'rien' }, options)
      if (input.fail === 'http') throw new HttpError('Refusé', 422)
      if (input.fail === 'boom') throw new Error('boom')
      return { body: { ok: true }, log: { ...usage } }
    },
    logs: { done: 'ok', refused: 'refusé', failed: 'erreur' },
    failure: 'Échec.',
  })
  return { handler, deps, recordUsage }
}

const post = (body: unknown, authorization = 'Bearer ok') => new Request('https://fn.test/f', { method: 'POST', headers: { authorization }, body: JSON.stringify(body) })

describe('createModelHandler : consommation', () => {
  it('enregistre la consommation de l’appel, avec la personne et le mode (champ kind)', async () => {
    const { handler, recordUsage } = setup()
    expect((await handler(post({ kind: 'ideas' }))).status).toBe(200)
    expect(recordUsage).toHaveBeenCalledWith({
      user_id: 'u1',
      mode: 'ideas',
      ok: true,
      model: 'claude-haiku-5-5',
      requests: 1,
      input_tokens: 120,
      output_tokens: 30,
      cache_creation_tokens: 0,
      cache_read_tokens: 10,
      web_searches: 0,
    })
  })

  it('enregistre aussi un appel en échec après la réponse du modèle (les tokens sont facturés)', async () => {
    const { handler, recordUsage } = setup()
    expect((await handler(post({ fail: 'http' }))).status).toBe(422)
    expect((await handler(post({ fail: 'boom' }))).status).toBe(500)
    expect(recordUsage).toHaveBeenCalledTimes(2)
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ ok: false, mode: null, input_tokens: 120 }))
  })

  it('prend le mode donné par la fonction', async () => {
    const { handler, recordUsage } = setup({}, () => 'texte')
    await handler(post({ kind: 'ignoré' }))
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'texte' }))
  })

  it('n’enregistre rien sans requête au modèle, et accepte une garde qui ne connaît pas la personne', async () => {
    const { handler, recordUsage } = setup({ apiKey: undefined })
    expect((await handler(post({}))).status).toBe(500)
    expect(recordUsage).not.toHaveBeenCalled()

    const anonymous = setup({ isSignedIn: async () => true })
    await anonymous.handler(post({}))
    expect(anonymous.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }))
  })

  it('n’attend pas l’usage d’une autre adresse que l’API du modèle', async () => {
    const fetchModel = vi.fn<typeof fetch>(async () => modelReply())
    const { handler } = setup({ fetchModel })
    await handler(post({}))
    expect(fetchModel).toHaveBeenCalledWith(API_URL, expect.anything())
  })
})

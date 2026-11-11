import { createHandler, type Deps } from './handler.ts'
import { MAX_PDF_BASE64, parseInput, readPattern, sanitizePattern, systemPrompt } from './pattern.ts'

const PDF = 'JVBERi0xLjQK' // « %PDF-1.4 »

const reply = (input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'enregistrer_patron', input }], usage: { input_tokens: 5000, output_tokens: 800 } }), { status: 200 })

const DECREASE = { kind: 'repeat', rows: null, every: 6, times: 4, actions: [{ text: '1 diminution de chaque côté', rank: null }], text: '', pattern: 'tous les 6 rangs' }

const PATTERN = {
  title: 'Pull Bergamote',
  sizes: ['S', 'M', 'L'],
  size_found: true,
  steps: [
    { title: 'Dos – côtes', instructions: 'Monter 64 m. et tricoter 6 cm en côtes 1/1.', total_rows: 18, stitches: 64, sections: [] },
    {
      title: 'Dos – emmanchures',
      instructions: 'Tricoter 4 rangs, puis diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
      total_rows: 30,
      stitches: 56,
      sections: [{ kind: 'rows', rows: 4, every: null, times: null, actions: [], text: '', pattern: '4 rangs' }, DECREASE],
    },
  ],
}

describe('entrée', () => {
  it('exige un PDF et une taille', () => {
    expect(parseInput({ pdf: PDF, size: ' M ' })).toEqual({ pdf: PDF, size: 'M' })
    expect(() => parseInput({ size: 'M' })).toThrow('PDF manquant.')
    // Taille facultative
    expect(parseInput({ pdf: PDF, size: '' })).toEqual({ pdf: PDF, size: '' })
    expect(parseInput({ pdf: PDF })).toEqual({ pdf: PDF, size: '' })
    expect(() => parseInput({ pdf: 'iVBORw0KGgo=', size: 'M' })).toThrow('Ce fichier n’est pas un PDF.')
    expect(() => parseInput({ pdf: 'J'.repeat(MAX_PDF_BASE64 + 1), size: 'M' })).toThrow('PDF trop lourd')
    expect(() => parseInput(null)).toThrow('PDF manquant.')
  })
})

describe('résultat du modèle', () => {
  it('garde les étapes, rangs, mailles et sections valides, dans l’ordre', () => {
    const pattern = sanitizePattern(
      {
        ...PATTERN,
        steps: [
          ...PATTERN.steps,
          { title: '  ', instructions: 'sans titre' },
          {
            title: 'Finitions',
            instructions: 'Coudre.',
            total_rows: -3,
            stitches: 'beaucoup',
            sections: [{ kind: 'repeat', every: 0, text: 'x' }, { kind: 'repeat', every: 2, actions: [{ text: ' ' }] }, { kind: 'rows', rows: null }, { kind: 'autre' }, 'n’importe quoi'],
          },
        ],
      },
      'M',
    )
    expect(pattern.title).toBe('Pull Bergamote')
    expect(pattern.sizes).toEqual(['S', 'M', 'L'])
    expect(pattern.steps).toEqual([
      { title: 'Dos – côtes', instructions: 'Monter 64 m. et tricoter 6 cm en côtes 1/1.', totalRows: 18, stitches: 64, sections: [] },
      {
        title: 'Dos – emmanchures',
        instructions: 'Tricoter 4 rangs, puis diminuer 1 m. de chaque côté tous les 6 rangs 4 fois.',
        totalRows: 30,
        stitches: 56,
        sections: [{ kind: 'rows', rows: 4, every: null, times: null, actions: [], text: '', pattern: '4 rangs' }, DECREASE],
      },
      { title: 'Finitions', instructions: 'Coudre.', totalRows: null, stitches: null, sections: [] },
    ])
  })

  it('garde une mesure en centimètres, à régler en rangs', () => {
    const pattern = sanitizePattern(
      {
        ...PATTERN,
        steps: [
          {
            title: 'Manches',
            instructions: 'Tricoter 5 cm, puis augmenter tous les 5 cm.',
            sections: [
              { kind: 'rows', rows: null, text: 'jersey', pattern: '5 cm' },
              { kind: 'repeat', every: null, text: '1 augmentation', pattern: 'tous les 5 cm' },
              { kind: 'repeat', every: null, text: 'sans intervalle' },
            ],
          },
        ],
      },
      'M',
    )
    expect(pattern.steps[0]!.sections).toEqual([
      { kind: 'rows', rows: null, every: null, times: null, actions: [], text: 'jersey', pattern: '5 cm' },
      { kind: 'repeat', rows: null, every: null, times: null, actions: [{ text: '1 augmentation', rank: null }], text: '', pattern: 'tous les 5 cm' },
    ])
  })

  it('garde plusieurs actions dans une répétition, chacune sur son rang, avec son effet sur les mailles', () => {
    const pattern = sanitizePattern(
      {
        ...PATTERN,
        steps: [
          {
            title: 'Raglan',
            sections: [
              {
                kind: 'repeat',
                every: 4,
                times: 5,
                actions: [
                  { text: '1 diminution', rank: 1, stitches: -1 },
                  { text: '1 augmentation', rank: null, stitches: 1.5 },
                  { text: 'marqueur', rank: 9, stitches: 0 },
                  { text: '', stitches: -999 },
                ],
              },
            ],
          },
        ],
      },
      'M',
    )
    // Effet sur les mailles gardé s'il est entier et raisonnable (0 compris), sinon laissé inconnu
    expect(pattern.steps[0]!.sections[0]!.actions).toEqual([
      { text: '1 diminution', rank: 1, stitches: -1 },
      { text: '1 augmentation', rank: null },
      { text: 'marqueur', rank: null, stitches: 0 },
    ])
  })

  it('garde le texte du patron tel quel et la position de la taille choisie', () => {
    const text = 'Monter 60 (64-68) m. et tricoter 6 (6-7) cm en côtes 1/1.'
    const steps = [{ title: 'Dos', instructions: text, total_rows: 18, stitches: 64, sections: [] }]
    const read = sanitizePattern({ ...PATTERN, steps, size_number: 2 }, 'M')
    expect(read.steps[0]!.instructions).toBe(text)
    expect(read.sizeIndex).toBe(1)
    // Sans position donnée : retrouvée dans la liste ; taille absente ou position hors liste : rien
    expect(sanitizePattern({ ...PATTERN, steps }, ' l ').sizeIndex).toBe(2)
    expect(sanitizePattern({ ...PATTERN, steps, size_number: 9 }, 'XL').sizeIndex).toBeNull()
    expect(sanitizePattern({ ...PATTERN, steps, instructions: undefined }, 'M').steps[0]!.instructions.length).toBe(text.length)
    expect(sanitizePattern({ ...PATTERN, steps: [{ ...steps[0], instructions: 'x'.repeat(30_000) }] }, 'M').steps[0]!.instructions).toHaveLength(20_000)
    expect(systemPrompt('M')).toContain('mot pour mot')
  })

  it('sans taille choisie : la première taille du patron', () => {
    expect(sanitizePattern({ ...PATTERN, size_found: false }, '').sizeIndex).toBe(0)
    expect(sanitizePattern({ ...PATTERN, size_number: 3 }, '').sizeIndex).toBe(2)
    expect(sanitizePattern({ ...PATTERN, sizes: [] }, '').sizeIndex).toBeNull()
    expect(systemPrompt('')).toContain('Prends la première taille du patron')
    expect(systemPrompt('M')).not.toContain('Prends la première taille du patron')
  })

  it('repère les diagrammes : page, lignes de la grille, étape et sens de lecture', () => {
    const charts = [
      { page: 4, title: 'Torsade', last_row: 24, odd_only: false, flat: true, step: 2 },
      // Rangs endroit seuls, numérotés 1 à 23 : 12 lignes
      { page: 5, title: 'Jacquard', last_row: 23, odd_only: true, flat: null, step: null },
      // En rond, l'option rangs endroit seuls n'a pas de sens ; étape hors patron ignorée
      { page: 6, title: '  Bordure ', last_row: null, odd_only: true, flat: false, step: 9 },
      { page: 0, title: 'Sans page', last_row: 8, odd_only: false, flat: null, step: null },
      'n’importe quoi',
    ]
    expect(sanitizePattern({ ...PATTERN, charts }, 'M').charts).toEqual([
      { page: 4, title: 'Torsade', rows: 24, step: 1, flat: true, oddOnly: false },
      { page: 5, title: 'Jacquard', rows: 12, step: null, flat: null, oddOnly: true },
      { page: 6, title: 'Bordure', rows: null, step: null, flat: false, oddOnly: false },
    ])
    expect(sanitizePattern(PATTERN, 'M').charts).toEqual([])
    expect(systemPrompt('M')).toContain('diagrammes')
  })

  it('relève le tableau des mesures, aligné sur les tailles', () => {
    const chart = {
      kind: 'finished',
      ease_cm: 8,
      rows: [
        { label: 'Tour de poitrine', measure: 'chest', values_cm: [92, 101.25, 110, 999] },
        { label: 'Longueur totale', measure: 'length', values_cm: [58, 'x'] },
        { label: '', measure: 'chest', values_cm: [1] },
        { label: 'Vide', measure: 'hip', values_cm: [] },
      ],
    }
    expect(sanitizePattern({ ...PATTERN, size_chart: chart }, 'M').sizeChart).toEqual({
      kind: 'finished',
      easeCm: 8,
      rows: [
        { label: 'Tour de poitrine', measure: 'chest', values: [92, 101.3, 110] },
        { label: 'Longueur totale', measure: 'other', values: [58, null, null] },
      ],
    })
    expect(sanitizePattern({ ...PATTERN, size_chart: null }, 'M').sizeChart).toBeNull()
    expect(sanitizePattern({ ...PATTERN, size_chart: { kind: 'autre', rows: chart.rows } }, 'M').sizeChart).toBeNull()
    expect(systemPrompt('M')).toContain('size_chart')
  })

  it('signale une taille introuvable avec les tailles du patron', () => {
    expect(() => sanitizePattern({ ...PATTERN, size_found: false, steps: [] }, 'XXL')).toThrow('Taille « XXL » introuvable. Tailles du patron : S, M, L.')
    expect(() => sanitizePattern({ size_found: false }, 'XXL')).toThrow('Taille « XXL » introuvable dans ce patron.')
  })

  it('refuse un PDF sans étapes et donne un titre par défaut', () => {
    expect(() => sanitizePattern({ ...PATTERN, steps: [] }, 'M')).toThrow('Aucune étape de tricot trouvée dans ce PDF.')
    expect(() => sanitizePattern(null, 'M')).toThrow('Aucune étape')
    expect(sanitizePattern({ ...PATTERN, title: '' }, 'M').title).toBe('Patron sans titre')
  })

  it('envoie le PDF et la taille au modèle', async () => {
    const fetchModel = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(PATTERN))
    const { pattern, usage } = await readPattern({ pdf: PDF, size: 'M' }, { apiKey: 'cle', fetch: fetchModel })
    expect(pattern.steps).toHaveLength(2)
    expect(usage).toEqual({ input_tokens: 5000, output_tokens: 800 })
    const body = JSON.parse(String(fetchModel.mock.calls[0]![1]!.body))
    expect(body.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF } })
    expect(body.system).toContain('Taille choisie : « M »')
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'enregistrer_patron' })
    expect(systemPrompt('4 ans')).toContain('recopie mot pour mot')
  })
})

describe('handler', () => {
  function setup(overrides: Partial<Deps> = {}) {
    const deps: Deps = {
      apiKey: 'cle',
      fetchModel: vi.fn(async () => reply(PATTERN)),
      log: vi.fn(),
      isSignedIn: vi.fn(async (auth: string | null) => auth === 'Bearer jeton'),
      ...overrides,
    }
    return { deps, handle: createHandler(deps) }
  }
  const post = (body: unknown, auth = 'Bearer jeton') =>
    new Request('https://fn.local/knit-pattern', { method: 'POST', headers: { authorization: auth }, body: typeof body === 'string' ? body : JSON.stringify(body) })

  it('lit le patron pour une personne connectée', async () => {
    const { handle, deps } = setup()
    const response = await handle(post({ pdf: PDF, size: 'M' }))
    expect(response.status).toBe(200)
    expect((await response.json()).steps).toHaveLength(2)
    expect(deps.log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ steps: 2 }))
  })

  it('refuse les requêtes invalides ou anonymes', async () => {
    const { handle } = setup()
    expect((await handle(post({ pdf: PDF, size: 'M' }, 'Bearer anon'))).status).toBe(401)
    expect((await handle(post('pas du json'))).status).toBe(400)
    expect((await handle(post({ size: 'M' }))).status).toBe(400)
    expect((await handle(new Request('https://fn.local/knit-pattern', { method: 'GET' }))).status).toBe(405)
    expect((await handle(new Request('https://fn.local/knit-pattern', { method: 'OPTIONS' }))).status).toBe(200)
  })

  it('renvoie un message lisible si la clé manque, la taille est introuvable ou tout échoue', async () => {
    const missing = await setup({ apiKey: undefined }).handle(post({ pdf: PDF, size: 'M' }))
    expect(missing.status).toBe(500)
    expect(await missing.json()).toEqual({ error: 'Le service d’analyse est mal configuré.' })

    const notFound = await setup({ fetchModel: vi.fn(async () => reply({ ...PATTERN, size_found: false, steps: [] })) }).handle(post({ pdf: PDF, size: 'XXL' }))
    expect(notFound.status).toBe(422)

    const crash = setup({ fetchModel: vi.fn(async () => new Response('{"content": 42}', { status: 200 })) })
    const crashed = await crash.handle(post({ pdf: PDF, size: 'M' }))
    expect(crashed.status).toBe(500)
    expect(await crashed.json()).toEqual({ error: 'La lecture a échoué.' })
  })
})

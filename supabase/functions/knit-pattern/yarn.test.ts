import { createHandler } from './handler.ts'
import { sanitizeGauge, sanitizePattern } from './pattern.ts'
import { MAX_LABEL_BASE64, parseLabelInput, sanitizeYarn } from './yarn.ts'

const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const LABEL = {
  is_label: true,
  brand: ' Phildar ',
  name: 'Partner 3.5',
  color: '0012 Ciel',
  dye_lot: '4471',
  composition: '50 % laine, 50 % acrylique',
  weight_g: 50,
  length_m: 125.4,
  needle_mm: 3.5,
}

const reply = (name: string, input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name, input }], usage: { input_tokens: 1500, output_tokens: 120 } }), { status: 200 })

describe('étiquette de laine', () => {
  it('exige une photo JPEG, PNG ou WebP', () => {
    expect(parseLabelInput({ pdf: 'x', size: 'M' })).toBeNull()
    expect(parseLabelInput({ label: PHOTO, media_type: 'image/png' })).toEqual({ label: PHOTO, mediaType: 'image/png' })
    expect(() => parseLabelInput({ label: '', media_type: 'image/png' })).toThrow('Photo manquante.')
    expect(() => parseLabelInput({ label: PHOTO, media_type: 'image/gif' })).toThrow('Format de photo non pris en charge')
    expect(() => parseLabelInput({ label: 'A'.repeat(MAX_LABEL_BASE64 + 1), media_type: 'image/png' })).toThrow('Photo trop lourde.')
    expect(() => parseLabelInput({ label: '<svg>', media_type: 'image/png' })).toThrow('Photo illisible.')
  })

  it('garde ce qui est lisible, borné comme en base', () => {
    expect(sanitizeYarn(LABEL)).toEqual({
      brand: 'Phildar',
      name: 'Partner 3.5',
      color: '0012 Ciel',
      dye_lot: '4471',
      composition: '50 % laine, 50 % acrylique',
      weight_g: 50,
      length_m: 125,
      needle_mm: 3.5,
    })
    expect(sanitizeYarn({ ...LABEL, weight_g: 5000, length_m: -3, needle_mm: 80, brand: '', color: 42 })).toMatchObject({
      brand: null,
      color: null,
      weight_g: null,
      length_m: null,
      needle_mm: null,
    })
  })

  it('refuse une photo sans étiquette, ou illisible', () => {
    expect(() => sanitizeYarn({ ...LABEL, is_label: false })).toThrow('Pas d’étiquette de laine sur cette photo.')
    expect(() => sanitizeYarn({ is_label: true })).toThrow('Rien de lisible sur cette étiquette.')
  })

  it('le handler lit l’étiquette envoyée en photo', async () => {
    const fetchModel = vi.fn<typeof fetch>(async () => reply('enregistrer_laine', LABEL))
    const log = vi.fn()
    const handle = createHandler({ apiKey: 'cle', fetchModel, log, isSignedIn: async () => true })
    const response = await handle(new Request('https://fn.local/knit-pattern', { method: 'POST', body: JSON.stringify({ label: PHOTO, media_type: 'image/png' }) }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ brand: 'Phildar', length_m: 125 })
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PHOTO } })
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ label: true }))
  })
})

describe('échantillon du patron', () => {
  it('ramène l’échantillon lu, arrondi au dixième, ou null', () => {
    expect(sanitizeGauge({ stitches: 22, rows: 30.04 })).toEqual({ stitches: 22, rows: 30 })
    expect(sanitizeGauge({ stitches: 22, rows: null })).toEqual({ stitches: 22, rows: null })
    expect(sanitizeGauge({ stitches: 0, rows: 500 })).toBeNull()
    expect(sanitizeGauge(null)).toBeNull()
    const steps = [{ title: 'Dos', instructions: '', total_rows: 10, stitches: 64, sections: [] }]
    expect(sanitizePattern({ title: 'Pull', sizes: ['M'], size_found: true, steps, gauge: { stitches: 22, rows: 30 } }, 'M').gauge).toEqual({ stitches: 22, rows: 30 })
    expect(sanitizePattern({ title: 'Pull', sizes: ['M'], size_found: true, steps }, 'M').gauge).toBeNull()
  })
})

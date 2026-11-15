import { handlerReplying, PDF, PHOTO, post, toolReply } from './testHelpers.ts'
import { MAX_INFO_PHOTOS, parseInfoInput, sanitizeInfo } from './info.ts'

const INFO = {
  is_pattern: true,
  title: ' Pull  Bergamote ',
  sizes: ['S', 'M', 'L'],
  meters: [900, 1000.4, null],
  needle_mm: 4,
  yarn: 'DROPS Alpaca',
  kind: 'Pull',
}

describe('infos d’un patron', () => {
  it('demande un PDF, ou quelques photos JPEG, PNG ou WebP', () => {
    expect(parseInfoInput({ label: PHOTO })).toBeNull()
    expect(parseInfoInput({ info: { pdf: PDF } })).toEqual({ pdf: PDF, photos: [] })
    expect(parseInfoInput({ info: { photos: [{ data: PHOTO, media_type: 'image/png' }] } })).toEqual({ pdf: null, photos: [{ data: PHOTO, mediaType: 'image/png' }] })
    expect(() => parseInfoInput({ info: {} })).toThrow('Patron manquant')
    expect(() => parseInfoInput({ info: { pdf: PHOTO } })).toThrow('Ce fichier n’est pas un PDF.')
    expect(() => parseInfoInput({ info: { photos: [{ data: PHOTO, media_type: 'image/gif' }] } })).toThrow('Format de photo non pris en charge')
    expect(() => parseInfoInput({ info: { photos: [{ data: '<svg>', media_type: 'image/png' }] } })).toThrow('Photo illisible.')
    const many = Array.from({ length: MAX_INFO_PHOTOS + 1 }, () => ({ data: PHOTO, media_type: 'image/png' }))
    expect(() => parseInfoInput({ info: { photos: many } })).toThrow(`${MAX_INFO_PHOTOS} photos au plus.`)
  })

  it('garde ce qui est lisible, borné comme la fiche', () => {
    expect(sanitizeInfo(INFO)).toEqual({ title: 'Pull Bergamote', sizes: ['S', 'M', 'L'], meters: [900, 1000, null], needleMm: 4, yarn: 'DROPS Alpaca', kind: 'pull' })
    // Taille unique : un seul métrage ; valeurs hors bornes écartées.
    expect(sanitizeInfo({ ...INFO, sizes: [], meters: [300, 400], needle_mm: 80, kind: '' })).toMatchObject({ sizes: [], meters: [300], needleMm: null, kind: null })
    expect(sanitizeInfo({ ...INFO, sizes: ['S', ' '], meters: [-3, 50_000] })).toMatchObject({ sizes: ['S'], meters: [null] })
  })

  it('cohérence : un métrage par taille, toujours', () => {
    for (const sizes of [[], ['S'], ['S', 'M', 'L', 'XL']]) {
      const info = sanitizeInfo({ ...INFO, sizes, meters: [500] })
      expect(info.meters).toHaveLength(Math.max(sizes.length, 1))
    }
  })

  it('refuse ce qui n’est pas un patron, ou un patron illisible', () => {
    expect(() => sanitizeInfo({ ...INFO, is_pattern: false })).toThrow('Ce document ne ressemble pas à un patron de tricot.')
    expect(() => sanitizeInfo({ is_pattern: true, sizes: [], meters: [] })).toThrow('Rien de lisible dans ce patron.')
  })

  it('le handler envoie le PDF au modèle et note la consommation', async () => {
    const { handle, fetchModel, log } = handlerReplying(toolReply('enregistrer_infos', INFO))
    const response = await handle(post({ info: { pdf: PDF } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ title: 'Pull Bergamote', meters: [900, 1000, null] })
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF } })
    expect(log).toHaveBeenCalledWith('patron lu', expect.objectContaining({ info: true, pdf: true }))
  })

  it('le handler envoie les photos des pages', async () => {
    const { handle, fetchModel } = handlerReplying(toolReply('enregistrer_infos', INFO))
    const response = await handle(post({ info: { photos: [{ data: PHOTO, media_type: 'image/png' }, { data: PHOTO, media_type: 'image/jpeg' }] } }))
    expect(response.status).toBe(200)
    const sent = JSON.parse(fetchModel.mock.calls[0]![1]!.body as string)
    expect(sent.messages[0].content.map((b: { type: string }) => b.type)).toEqual(['image', 'image', 'text'])
  })
})

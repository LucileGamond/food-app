import { createKnittingApi } from '@/modules/tricot/api'
import type { PatternStep } from '@/modules/tricot/lib/pattern'
import { ERIC, PNG_1PX, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

const STEPS: PatternStep[] = [{ title: 'Dos', instructions: 'Monter 64 m.', totalRows: 18, stitches: 64, sections: [] }]
/** Photo déjà réduite (l'écran la réduit avant l'envoi). */
const photo = () => new Blob([PNG_1PX], { type: 'image/jpeg' })

describe('notes et photos d’avancement', () => {
  it('enregistre les notes, ajoute, légende et supprime des photos', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })
    const stepId = (await api.knitting.getProject(id))!.steps[0]!.id
    expect(await api.knitting.getProgress(id)).toEqual({ notes: '', photos: [] })

    await api.knitting.saveProjectNotes(id, 'Manches raccourcies')
    await api.knitting.addProgressPhoto(id, photo(), { stepId, caption: 'Début' })
    let progress = await api.knitting.getProgress(id)
    expect(progress.notes).toBe('Manches raccourcies')
    expect(progress.photos).toEqual([expect.objectContaining({ caption: 'Début', stepId })])
    const [first] = progress.photos
    expect(first!.storagePath).toMatch(/\.jpg$/)

    // Photo visible par un lien temporaire
    const urls = await api.knitting.progressPhotoUrls([first!.storagePath])
    expect((await fetch(urls[first!.storagePath]!)).ok).toBe(true)

    await api.knitting.saveCaption(first!.id, 'Fin du dos')
    expect((await api.knitting.getProgress(id)).photos[0]!.caption).toBe('Fin du dos')

    // Chacun ses projets
    await expect(eric.api.knitting.getProgress(id)).rejects.toThrow()
    await expect(eric.api.knitting.addProgressPhoto(id, photo(), { stepId: null, caption: '' })).rejects.toThrow('Tu n')

    await api.knitting.deleteProgressPhoto(first!)
    progress = await api.knitting.getProgress(id)
    expect(progress.photos).toEqual([])
    expect(await api.knitting.progressPhotoUrls([first!.storagePath])).toEqual({})
  })

  it('refuse sans connexion et les valeurs invalides', async () => {
    const anon = createKnittingApi(anonClient())
    await expect(anon.getProgress(crypto.randomUUID())).rejects.toThrow()
    await expect(anon.addProgressPhoto(crypto.randomUUID(), photo(), { stepId: null, caption: '' })).rejects.toThrow('Reconnecte-toi')
    await expect(anon.progressPhotoUrls(['perdu/perdu.jpg'])).resolves.toEqual({})

    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })
    await expect(api.knitting.saveProjectNotes(id, 'x'.repeat(5001))).rejects.toThrow()
    await expect(api.knitting.addProgressPhoto(id, photo(), { stepId: null, caption: 'x'.repeat(201) })).rejects.toThrow()
    expect((await api.knitting.getProgress(id)).photos).toEqual([])
    await api.knitting.addProgressPhoto(id, photo(), { stepId: null, caption: '' })
    const [added] = (await api.knitting.getProgress(id)).photos
    await expect(api.knitting.saveCaption(added!.id, 'x'.repeat(201))).rejects.toThrow()
    await expect(api.knitting.deleteProgressPhoto({ id: crypto.randomUUID(), storagePath: 'perdu/perdu.jpg' })).resolves.toBeUndefined()
  })
})

describe('patron adapté', () => {
  it('enregistre, relit, bascule et supprime l’adaptation ; chacun ses projets', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })
    const stepId = (await api.knitting.getProject(id))!.steps[0]!.id
    expect((await api.knitting.getProject(id))!.adaptation).toBeNull()

    const adaptation = {
      request: '5 cm de plus',
      active: true,
      at: '2026-11-08T10:00:00.000Z',
      size: 'M',
      steps: [{ stepId, totalRows: 34, stitches: 70, sections: [{ kind: 'rows' as const, rows: 34, every: null, times: null, text: 'jersey', pattern: null }], note: '16 rangs de plus.' }],
    }
    await api.knitting.saveAdaptation(id, adaptation)
    const read = await api.knitting.getProject(id)
    expect(read!.adaptation).toEqual(adaptation)
    // Le patron d'origine n'est pas touché
    expect(read!.steps[0]).toMatchObject({ totalRows: 18, stitches: 64 })

    await api.knitting.saveAdaptation(id, { ...adaptation, active: false })
    expect((await api.knitting.getProject(id))!.adaptation!.active).toBe(false)

    // Eric ne voit pas le projet : sa mise à jour ne touche rien
    await eric.api.knitting.saveAdaptation(id, null)
    expect((await api.knitting.getProject(id))!.adaptation).not.toBeNull()

    await expect(api.knitting.saveAdaptation(id, { ...adaptation, request: 'x'.repeat(1001) })).rejects.toThrow()
    await api.knitting.saveAdaptation(id, null)
    expect((await api.knitting.getProject(id))!.adaptation).toBeNull()
  })
})

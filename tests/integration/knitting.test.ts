import { createKnittingApi, fileToBase64 } from '@/modules/tricot/api'
import type { PatternStep } from '@/modules/tricot/lib/pattern'
import { ERIC, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

const STEPS: PatternStep[] = [
  { title: 'Dos – côtes', instructions: 'Monter 64 m.', totalRows: 18, stitches: 64, reminders: [] },
  { title: 'Emmanchures', instructions: 'Diminuer', totalRows: 30, stitches: 56, reminders: [{ every: 6, first: null, times: 4, action: '1 diminution' }] },
]
const pdf = () => new File(['%PDF-1.4\n%fin'], 'patron.pdf', { type: 'application/pdf' })

describe('knitting api', () => {
  it('enregistre un projet avec son PDF, suit l’avancée et supprime tout', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull Bergamote', size: 'M', pdf: pdf(), steps: STEPS })

    expect(await api.knitting.listProjects()).toEqual([expect.objectContaining({ id, title: 'Pull Bergamote', size: 'M', stepsDone: 0, stepsTotal: 2 })])
    let project = (await api.knitting.getProject(id))!
    expect(project.steps.map((s) => [s.position, s.title, s.totalRows, s.reminders.length, s.rowCount])).toEqual([
      [0, 'Dos – côtes', 18, 0, 0],
      [1, 'Emmanchures', 30, 1, 0],
    ])
    expect(project.steps[1]!.reminders[0]).toEqual({ every: 6, first: null, times: 4, action: '1 diminution' })

    await api.knitting.saveProgress(project.steps[0]!.id, { rowCount: 18, done: true })
    await api.knitting.saveProgress(project.steps[1]!.id, { rowCount: 6, notes: 'Aiguilles 4' })
    project = (await api.knitting.getProject(id))!
    expect(project.steps.map((s) => [s.rowCount, s.done, s.notes])).toEqual([
      [18, true, ''],
      [6, false, 'Aiguilles 4'],
    ])
    expect((await api.knitting.listProjects())[0]!.stepsDone).toBe(1)

    // PDF d'origine consultable
    const url = await api.knitting.pdfUrl(project.pdfPath!)
    expect(await (await fetch(url)).text()).toContain('%PDF-1.4')

    await api.knitting.deleteProject(project)
    expect(await api.knitting.listProjects()).toEqual([])
    await expect(api.knitting.pdfUrl(project.pdfPath!)).rejects.toThrow('Impossible d’ouvrir le PDF.')
  })

  it('garde chaque projet pour sa propriétaire, accepte un projet sans PDF', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await lucile.api.knitting.createProject({ title: 'Bonnet', size: '4 ans', pdf: null, steps: STEPS.slice(0, 1) })
    expect((await lucile.api.knitting.getProject(id))!.pdfPath).toBeNull()
    expect(await eric.api.knitting.listProjects()).toEqual([])
    expect(await eric.api.knitting.getProject(id)).toBeNull()
  })

  it('refuse un projet invalide et l’accès sans connexion', async () => {
    const { api } = await signedInApi()
    await expect(api.knitting.createProject({ title: 'Vide', size: 'M', pdf: null, steps: [] })).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: new File(['x'], 'photo.png', { type: 'image/png' }), steps: STEPS })).rejects.toThrow('Choisis un fichier PDF.')
    const anon = createKnittingApi(anonClient())
    await expect(anon.listProjects()).rejects.toThrow()
    await expect(anon.getProject('00000000-0000-0000-0000-000000000000')).rejects.toThrow()
    await expect(anon.saveProgress('00000000-0000-0000-0000-000000000000', { rowCount: 1 })).rejects.toThrow()
    await expect(anon.deleteProject({ id: '00000000-0000-0000-0000-000000000000', pdfPath: null })).rejects.toThrow()
    await expect(createKnittingApi(anonClient()).createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })).rejects.toThrow()
    await expect(createKnittingApi(anonClient()).createProject({ title: 'Pull', size: 'M', pdf: pdf(), steps: STEPS })).rejects.toThrow('Reconnecte-toi')
  })

  it('retire le PDF envoyé si le projet est refusé, et refuse un PDF trop lourd', async () => {
    const { api, db } = await signedInApi()
    await expect(api.knitting.createProject({ title: ' ', size: 'M', pdf: pdf(), steps: STEPS })).rejects.toThrow('Certaines valeurs sont invalides.')
    const { data: session } = await db.auth.getSession()
    const { data: files } = await db.storage.from('knit-patterns').list(session.session!.user.id)
    expect(files ?? []).toEqual([])

    const heavy = new File(['%PDF'], 'lourd.pdf', { type: 'application/pdf' })
    Object.defineProperty(heavy, 'size', { value: 21 * 1024 * 1024 })
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: heavy, steps: STEPS })).rejects.toThrow('PDF trop lourd (20 Mo au plus).')
    await expect(api.knitting.readPattern(heavy, 'M')).rejects.toThrow('PDF trop lourd (20 Mo au plus).')

    // Projet sans PDF : suppression sans fichier à retirer
    const id = await api.knitting.createProject({ title: 'Écharpe', size: 'Unique', pdf: null, steps: STEPS })
    await api.knitting.deleteProject({ id, pdfPath: null })
    expect(await api.knitting.listProjects()).toEqual([])
  })

  it('appelle la lecture du patron (sans clé d’analyse en local)', async () => {
    const { api } = await signedInApi()
    expect(await fileToBase64(new Blob(['%PDF']))).toBe('JVBERg==')
    await expect(api.knitting.readPattern(pdf(), 'M')).rejects.toThrow('Le service d’analyse est mal configuré.')
  })
})

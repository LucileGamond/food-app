import { createKnittingApi, fileToBase64 } from '@/modules/tricot/api'
import type { PatternStep } from '@/modules/tricot/lib/pattern'
import { ERIC, anonClient, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

const STEPS: PatternStep[] = [
  { title: 'Dos – côtes', instructions: 'Monter 64 m.', totalRows: 18, stitches: 64, sections: [] },
  { title: 'Emmanchures', instructions: 'Diminuer', totalRows: 30, stitches: 56, sections: [{ kind: 'rows', rows: 4, every: null, times: null, text: '', pattern: null }, { kind: 'repeat', rows: null, every: 6, times: 4, text: '1 diminution', pattern: 'tous les 6 rangs' }] },
]
const pdf = () => new File(['%PDF-1.4\n%fin'], 'patron.pdf', { type: 'application/pdf' })

describe('knitting api', () => {
  it('enregistre un projet avec son PDF, suit l’avancée et supprime tout', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull Bergamote', size: 'M', pdf: pdf(), steps: STEPS })

    expect(await api.knitting.listProjects()).toEqual([expect.objectContaining({ id, title: 'Pull Bergamote', size: 'M', stepsDone: 0, stepsTotal: 2 })])
    let project = (await api.knitting.getProject(id))!
    expect(project.steps.map((s) => [s.position, s.title, s.totalRows, s.sections.length, s.rowCount])).toEqual([
      [0, 'Dos – côtes', 18, 0, 0],
      [1, 'Emmanchures', 30, 2, 0],
    ])
    expect(project.steps[1]!.sections[1]).toEqual({ kind: 'repeat', rows: null, every: 6, times: 4, text: '1 diminution', pattern: 'tous les 6 rangs' })

    await api.knitting.saveProgress(project.steps[0]!.id, { rowCount: 18, done: true })
    await api.knitting.saveProgress(project.steps[1]!.id, { rowCount: 6, notes: 'Aiguilles 4', sections: [{ kind: 'repeat', rows: null, every: 8, times: 3, text: '1 augmentation', pattern: 'tous les 5 cm' }] })
    project = (await api.knitting.getProject(id))!
    expect(project.steps.map((s) => [s.rowCount, s.done, s.notes])).toEqual([
      [18, true, ''],
      [6, false, 'Aiguilles 4'],
    ])
    expect(project.steps[1]!.sections).toEqual([{ kind: 'repeat', rows: null, every: 8, times: 3, text: '1 augmentation', pattern: 'tous les 5 cm' }])
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

describe('laine, échantillon et patrons en attente', () => {
  it('enregistre la laine et les échantillons du projet', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, gauge: { stitches: 22, rows: null } })
    let project = (await api.knitting.getProject(id))!
    expect(project).toMatchObject({ yarns: [], patternGauge: { stitches: 22, rows: null }, myGauge: { stitches: null, rows: null } })

    const yarn = { brand: 'Phildar', name: 'Partner 3.5', color: null, dye_lot: '4471', composition: null, weight_g: 50, length_m: 125, skeins: 6.5, needle_mm: 3.5 }
    await api.knitting.saveProjectInfo(id, { yarns: [yarn], patternGauge: { stitches: 22, rows: 30 }, myGauge: { stitches: 24, rows: 28.5 } })
    project = (await api.knitting.getProject(id))!
    expect(project.yarns).toEqual([yarn])
    expect(project.patternGauge).toEqual({ stitches: 22, rows: 30 })
    expect(project.myGauge).toEqual({ stitches: 24, rows: 28.5 })

    await expect(api.knitting.saveProjectInfo(id, { yarns: [{ ...yarn, skeins: -2 }], patternGauge: project.patternGauge, myGauge: project.myGauge })).rejects.toThrow()
  })

  it('met un patron de côté, le commence (PDF repris) et le retire de la liste', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const queuedId = await api.knitting.addToQueue({ title: 'Gilet', pdf: pdf(), url: null, size: 'M', yarnIdea: 'Mérinos', notes: '', priority: 1, metersNeeded: 600, needleMm: 4 })
    await api.knitting.addToQueue({ title: 'Bonnet', pdf: null, url: 'https://patrons.exemple/bonnet', size: null, yarnIdea: '', notes: 'Pour Eric', priority: 3, metersNeeded: null, needleMm: null })

    const queue = await api.knitting.listQueue()
    expect(queue.map((q) => [q.title, q.size, q.priority, q.url])).toEqual([
      ['Gilet', 'M', 1, null],
      ['Bonnet', null, 3, 'https://patrons.exemple/bonnet'],
    ])
    expect(await eric.api.knitting.listQueue()).toEqual([])

    const queued = (await api.knitting.getQueued(queuedId))!
    const file = await api.knitting.downloadPdf(queued.pdfPath!, queued.title)
    expect(await file.text()).toContain('%PDF-1.4')

    const id = await api.knitting.createProject({ title: 'Gilet', size: 'M', pdf: file, steps: STEPS, queued })
    expect((await api.knitting.getProject(id))!.pdfPath).toBe(queued.pdfPath)
    expect((await api.knitting.listQueue()).map((q) => q.title)).toEqual(['Bonnet'])

    const bonnet = (await api.knitting.listQueue())[0]!
    await api.knitting.deleteQueued(bonnet)
    expect(await api.knitting.listQueue()).toEqual([])
    expect(await api.knitting.getQueued(bonnet.id)).toBeNull()
  })
})

describe('patrons en attente : erreurs', () => {
  it('refuse sans connexion, et n’enregistre rien d’invalide', async () => {
    const anon = createKnittingApi(anonClient())
    await expect(anon.listQueue()).rejects.toThrow()
    await expect(anon.getQueued(crypto.randomUUID())).rejects.toThrow()
    await expect(anon.addToQueue({ title: 'Gilet', pdf: pdf(), url: null, size: null, yarnIdea: '', notes: '', priority: 2, metersNeeded: null, needleMm: null })).rejects.toThrow('Reconnecte-toi')
    await expect(anon.deleteQueued({ id: crypto.randomUUID(), pdfPath: null })).rejects.toThrow()
    await expect(anon.downloadPdf('perdu/perdu.pdf', 'Perdu')).rejects.toThrow('Impossible de récupérer le PDF du patron.')
    await expect(anon.saveProjectInfo(crypto.randomUUID(), { yarns: [], patternGauge: { stitches: null, rows: null }, myGauge: { stitches: null, rows: null } })).rejects.toThrow()

    const { api } = await signedInApi()
    // Priorité hors bornes : refusé, et le PDF déjà envoyé est retiré.
    await expect(api.knitting.addToQueue({ title: 'Gilet', pdf: pdf(), url: null, size: null, yarnIdea: '', notes: '', priority: 9 as 1, metersNeeded: null, needleMm: null })).rejects.toThrow()
    expect(await api.knitting.listQueue()).toEqual([])
    // Lien invalide, sans PDF : refusé.
    await expect(api.knitting.addToQueue({ title: 'Gilet', pdf: null, url: 'ftp://patrons', size: null, yarnIdea: '', notes: '', priority: 2, metersNeeded: null, needleMm: null })).rejects.toThrow()
    // Lecture par le modèle impossible ici (pas de clé) : erreur lisible.
    await expect(api.knitting.readPattern(pdf(), 'M')).rejects.toThrow()
    // Projet refusé (aucune étape) : le PDF envoyé est retiré aussi.
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: pdf(), steps: [] })).rejects.toThrow()
  })
})

describe('stock de laine', () => {
  it('ajoute, modifie et retire des laines du stock, chacun les siennes', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const yarn = { brand: 'DROPS', name: 'Merino', color: null, dye_lot: null, composition: null, weight_g: 50, length_m: 105, skeins: 8, needle_mm: 4 }
    await api.knitting.saveStashItem({ id: null, yarn, notes: 'Bleu' })
    let stash = await api.knitting.listStash()
    expect(stash).toEqual([expect.objectContaining({ yarn, notes: 'Bleu' })])
    expect(await eric.api.knitting.listStash()).toEqual([])

    await api.knitting.saveStashItem({ id: stash[0]!.id, yarn: { ...yarn, skeins: 3.5 }, notes: 'Bleu' })
    stash = await api.knitting.listStash()
    expect(stash[0]!.yarn.skeins).toBe(3.5)
    await expect(api.knitting.saveStashItem({ id: null, yarn: { ...yarn, skeins: -1 }, notes: '' })).rejects.toThrow()

    await api.knitting.deleteStashItem(stash[0]!.id)
    expect(await api.knitting.listStash()).toEqual([])
    await expect(createKnittingApi(anonClient()).listStash()).rejects.toThrow()
    // Idées : le modèle n'est pas disponible ici, l'erreur est lisible.
    await expect(api.knitting.yarnIdeas(yarn)).rejects.toThrow()
  })
})

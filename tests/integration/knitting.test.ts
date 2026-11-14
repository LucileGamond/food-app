import { createKnittingApi, fileToBase64 } from '@/modules/tricot/api'
import type { PatternStep, ReadPattern } from '@/modules/tricot/lib/pattern'
import type { PatternFields, PatternFiles } from '@/modules/tricot/lib/library'
import { ERIC, LUCILE, anonClient, resetData, signedInApi } from './helpers'

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

    expect(await api.knitting.listProjects()).toEqual([
      expect.objectContaining({ id, title: 'Pull Bergamote', size: 'M', stepsDone: 0, stepsTotal: 2, current: { number: 1, title: 'Dos – côtes', rowCount: 0, totalRows: 18, times: 1, pass: 1 } }),
    ])
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
    expect((await api.knitting.listProjects())[0]).toMatchObject({ stepsDone: 1, current: { number: 2, title: 'Emmanchures', rowCount: 6, totalRows: 30 } })

    // Étape tricotée 2 fois (les deux manches) : la 2e fois repart à 0
    expect(project.steps.map((s) => [s.times, s.pass])).toEqual([
      [1, 1],
      [1, 1],
    ])
    await api.knitting.saveProgress(project.steps[1]!.id, { times: 2, pass: 1 })
    await api.knitting.saveProgress(project.steps[1]!.id, { pass: 2, rowCount: 0 })
    project = (await api.knitting.getProject(id))!
    expect([project.steps[1]!.times, project.steps[1]!.pass, project.steps[1]!.rowCount]).toEqual([2, 2, 0])
    await expect(api.knitting.saveProgress(project.steps[1]!.id, { pass: 3 })).rejects.toThrow()

    // PDF d'origine consultable
    const url = await api.knitting.pdfUrl(project.pdfPath!)
    expect(await (await fetch(url)).text()).toContain('%PDF-1.4')

    // Projet supprimé : son patron reste dans la bibliothèque, avec le PDF ; supprimé à son tour, le PDF part avec lui.
    await api.knitting.deleteProject(project)
    expect(await api.knitting.listProjects()).toEqual([])
    const [kept] = await api.knitting.listPatterns()
    expect([kept!.title, kept!.pdfPath, kept!.projects]).toEqual(['Pull Bergamote', project.pdfPath, []])
    expect(await (await fetch(await api.knitting.pdfUrl(project.pdfPath!))).text()).toContain('%PDF-1.4')
    await api.knitting.deletePattern(kept!)
    await expect(api.knitting.pdfUrl(project.pdfPath!)).rejects.toThrow('Impossible d’ouvrir le PDF.')
  })

  it('regroupe une étape avec la suivante ; refuse si la suivante est commencée', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: [...STEPS, { title: 'Col', instructions: '', totalRows: null, stitches: null, sections: [] }] })
    let project = (await api.knitting.getProject(id))!
    const [first, second, collar] = project.steps
    const sections = [{ kind: 'rows' as const, rows: 18, every: null, times: null, text: 'côtes', pattern: null }]
    await api.knitting.mergeSteps(first!.id, { sections, totalRows: 48 })
    project = (await api.knitting.getProject(id))!
    expect(project.steps.map((s) => [s.position, s.title, s.totalRows, s.stitches])).toEqual([
      [0, 'Dos – côtes', 48, 56],
      [1, 'Col', null, null],
    ])
    expect(project.steps[0]!.instructions).toBe('Monter 64 m.\n\nDiminuer')
    expect(project.steps[0]!.sections).toEqual(sections)
    expect(second).toBeDefined()

    await api.knitting.saveProgress(collar!.id, { rowCount: 2 })
    await expect(api.knitting.mergeSteps(first!.id, { sections, totalRows: null })).rejects.toThrow()
  })

  it('déplace une sous-étape et sépare une étape ; une suite de réorganisations reste cohérente en base', async () => {
    const { api } = await signedInApi()
    const r = (n: number, text: string) => ({ kind: 'rows' as const, rows: n, every: null, times: null, text, pattern: null })
    const id = await api.knitting.createProject({
      title: 'Pull',
      size: 'M',
      pdf: null,
      steps: [
        { title: 'Dos', instructions: 'Côtes 10 rangs.\n\nJersey 20 rangs.', totalRows: 30, stitches: 90, sections: [{ ...r(10, 'côtes'), source: 'Côtes 10 rangs.' }, { ...r(20, 'jersey'), source: 'Jersey 20 rangs.' }] },
        { title: 'Manche', instructions: 'Côtes 12 rangs.', totalRows: 12, stitches: null, sections: [{ ...r(12, 'côtes'), source: 'Côtes 12 rangs.' }] },
      ],
    })
    const load = async () => (await api.knitting.getProject(id))!.steps
    let steps = await load()
    const { moveSection, splitStep } = await import('@/modules/tricot/lib/organize')
    const { mergeSteps } = await import('@/modules/tricot/lib/merge')

    await api.knitting.saveSections(moveSection(steps[0]!, 1, steps[1]!))
    steps = await load()
    expect(steps.map((s) => [s.title, s.totalRows, s.sections.map((x) => x.text)])).toEqual([
      ['Dos', 10, ['côtes']],
      ['Manche', 32, ['côtes', 'jersey']],
    ])
    // Le texte suit la sous-étape déplacée
    expect(steps.map((s) => s.instructions)).toEqual(['Côtes 10 rangs.', 'Côtes 12 rangs.\n\nJersey 20 rangs.'])

    await api.knitting.splitStep(steps[1]!.id, splitStep(steps[1]!, 1))
    steps = await load()
    expect(steps.map((s) => [s.position, s.title, s.totalRows, s.sections.map((x) => x.text)])).toEqual([
      [0, 'Dos', 10, ['côtes']],
      [1, 'Manche', 12, ['côtes']],
      [2, 'Manche (suite)', 20, ['jersey']],
    ])
    expect(steps.map((s) => s.instructions)).toEqual(['Côtes 10 rangs.', 'Côtes 12 rangs.', 'Jersey 20 rangs.'])

    // Regrouper ce qui vient d'être séparé : retour à l'étape d'avant
    await api.knitting.mergeSteps(steps[1]!.id, mergeSteps(steps[1]!, steps[2]!))
    steps = await load()
    expect(steps.map((s) => [s.position, s.title, s.totalRows, s.sections.map((x) => x.text)])).toEqual([
      [0, 'Dos', 10, ['côtes']],
      [1, 'Manche', 32, ['côtes', 'jersey']],
    ])
    expect(steps[1]!.instructions).toBe('Côtes 12 rangs.\n\nJersey 20 rangs.')

    await api.knitting.saveProgress(steps[1]!.id, { rowCount: 1 })
    await expect(api.knitting.saveSections(moveSection(steps[1]!, 0, steps[0]!))).rejects.toThrow()
    await expect(api.knitting.splitStep(steps[1]!.id, splitStep(steps[1]!, 1))).rejects.toThrow()
  })

  it('garde les aiguilles du patron, lues à l’import puis modifiées', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, needles: [3.5, 3] })
    expect((await api.knitting.getProject(id))!.needles).toEqual([3, 3.5])
    await api.knitting.saveNeedles(id, [4])
    expect((await api.knitting.getProject(id))!.needles).toEqual([4])
    // Échantillon par aiguille, et conversions vérifiées pour elle
    // Mailles au début saisies sur une étape, puis retour au patron
    const step = (await api.knitting.getProject(id))!.steps[0]!
    await api.knitting.saveProgress(step.id, { startStitches: 70 })
    expect((await api.knitting.getProject(id))!.steps[0]!.startStitches).toBe(70)
    await api.knitting.saveProgress(step.id, { startStitches: null })
    expect((await api.knitting.getProject(id))!.steps[0]!.startStitches).toBeNull()
    await api.knitting.saveGauges(id, [{ needle: 4, stitches: 20, rows: 28, checked: true }])
    expect((await api.knitting.getProject(id))!.gauges).toEqual([{ needle: 4, stitches: 20, rows: 28, checked: true }])
    const other = await api.knitting.createProject({ title: 'Bonnet', size: 'M', pdf: null, steps: STEPS })
    expect((await api.knitting.getProject(other))!.needles).toEqual([])
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
    // Manches à tricoter 2 fois, lues dans le patron
    const sleeves = await api.knitting.createProject({ title: 'Gilet', size: 'M', pdf: null, steps: [{ ...STEPS[0]!, title: 'Manches', times: 2 }, STEPS[1]!] })
    expect((await api.knitting.getProject(sleeves))!.steps.map((s) => [s.title, s.times, s.pass])).toEqual([
      ['Manches', 2, 1],
      ['Emmanchures', 1, 1],
    ])
    await expect(api.knitting.createProject({ title: 'Vide', size: 'M', pdf: null, steps: [] })).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: new File(['x'], 'photo.png', { type: 'image/png' }), steps: STEPS })).rejects.toThrow('Choisis un fichier PDF.')
    const anon = createKnittingApi(anonClient())
    await expect(anon.listProjects()).rejects.toThrow()
    await expect(anon.getProject('00000000-0000-0000-0000-000000000000')).rejects.toThrow()
    await expect(anon.saveProgress('00000000-0000-0000-0000-000000000000', { rowCount: 1 })).rejects.toThrow()
    await expect(anon.deleteProject({ id: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow()
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
    await api.knitting.deleteProject({ id })
    expect(await api.knitting.listProjects()).toEqual([])
  })

  it('appelle la lecture du patron (sans clé d’analyse en local)', async () => {
    const { api } = await signedInApi()
    expect(await fileToBase64(new Blob(['%PDF']))).toBe('JVBERg==')
    await expect(api.knitting.readPattern(pdf(), 'M')).rejects.toThrow('Le service d’analyse est mal configuré.')
  })
})

describe('laine et échantillon', () => {
  it('enregistre la laine et les échantillons du projet', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, gauge: { stitches: 22, rows: null } })
    let project = (await api.knitting.getProject(id))!
    expect(project).toMatchObject({ yarns: [], patternGauge: { stitches: 22, rows: null }, gauges: [] })

    const yarn = { brand: 'Phildar', name: 'Partner 3.5', color: null, dye_lot: '4471', composition: null, weight_g: 50, length_m: 125, skeins: 6.5, needle_mm: 3.5 }
    await api.knitting.saveProjectInfo(id, { yarns: [yarn], patternGauge: { stitches: 22, rows: 30 } })
    // Les échantillons de la tricoteuse vivent dans leur propre liste, par aiguille
    await api.knitting.saveGauges(id, [{ needle: null, stitches: 24, rows: 28.5, checked: false }])
    project = (await api.knitting.getProject(id))!
    expect(project.yarns).toEqual([yarn])
    expect(project.patternGauge).toEqual({ stitches: 22, rows: 30 })
    expect(project.gauges).toEqual([{ needle: null, stitches: 24, rows: 28.5, checked: false }])

    await expect(api.knitting.saveProjectInfo(id, { yarns: [{ ...yarn, skeins: -2 }], patternGauge: project.patternGauge })).rejects.toThrow()
  })

})

describe('bibliothèque de patrons', () => {
  const FIELDS: PatternFields = { title: 'Gilet', url: null, size: 'M', yarnIdea: 'Mérinos', notes: '', metersNeeded: 600, needleMm: 4, wish: 1 }
  const NO_FILES: PatternFiles = { pdfPath: null, newPdf: null, photos: [], newPhotos: [] }
  const jpeg = () => new Blob(['\xff\xd8\xff photo'], { type: 'image/jpeg' })

  it('range chaque nouveau projet dans la bibliothèque ; un patron sert à plusieurs projets', async () => {
    const { api } = await signedInApi()
    const first = await api.knitting.createProject({ title: 'Pull Bergamote', size: 'M', pdf: pdf(), steps: STEPS })
    const [library] = await api.knitting.listPatterns()
    expect(library).toMatchObject({ title: 'Pull Bergamote', size: 'M', wish: null, projects: [{ id: first, title: 'Pull Bergamote', size: 'M' }] })

    // Deuxième projet du même patron (autre taille) : le PDF est repris, rien n'est renvoyé.
    const second = await api.knitting.createProject({ title: 'Pull pour Eric', size: 'L', pdf: null, steps: STEPS, pattern: { id: library!.id, pdfPath: library!.pdfPath } })
    expect((await api.knitting.getProject(second))!.pdfPath).toBe(library!.pdfPath)
    const patterns = await api.knitting.listPatterns()
    expect(patterns).toHaveLength(1)
    expect(patterns[0]!.projects.map((p) => p.id).toSorted()).toEqual([first, second].toSorted())
  })

  it('ajoute un patron en PDF, photos et lien, le commence (PDF repris), le modifie puis le supprime', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await api.knitting.savePattern({ ...FIELDS, url: 'https://patrons.exemple/gilet' }, { ...NO_FILES, newPdf: pdf(), newPhotos: [jpeg(), jpeg()] }, null)
    await api.knitting.savePattern({ ...FIELDS, title: 'Bonnet', url: 'https://patrons.exemple/bonnet', size: null, wish: 3, metersNeeded: null, needleMm: null }, NO_FILES, null)

    expect((await api.knitting.listPatterns()).map((p) => [p.title, p.wish, p.url, p.photos.length, p.pdfPath !== null]).toSorted()).toEqual([
      ['Bonnet', 3, 'https://patrons.exemple/bonnet', 0, false],
      ['Gilet', 1, 'https://patrons.exemple/gilet', 2, true],
    ])
    expect(await eric.api.knitting.listPatterns()).toEqual([])
    expect(await eric.api.knitting.getPattern(id)).toBeNull()

    const gilet = (await api.knitting.getPattern(id))!
    const urls = await api.knitting.progressPhotoUrls(gilet.photos)
    expect(Object.keys(urls).toSorted()).toEqual(gilet.photos.toSorted())
    const file = await api.knitting.downloadPdf(gilet.pdfPath!, gilet.title)
    expect(await file.text()).toContain('%PDF-1.4')

    // Commencé : relié au projet, il reste dans la bibliothèque et n'est plus une envie.
    const project = await api.knitting.createProject({ title: 'Gilet', size: 'M', pdf: file, steps: STEPS, pattern: { id, pdfPath: gilet.pdfPath } })
    expect((await api.knitting.getProject(project))!.pdfPath).toBe(gilet.pdfPath)
    const started = (await api.knitting.getPattern(id))!
    expect([started.wish, started.projects.map((p) => p.id)]).toEqual([null, [project]])

    // Modifié : une photo retirée (fichier supprimé), une ajoutée ; le PDF, lu par le projet, est gardé.
    const [removed, keptPhoto] = started.photos
    await api.knitting.savePattern({ ...FIELDS, notes: 'Col en V', wish: null }, { pdfPath: null, newPdf: null, photos: [keptPhoto!], newPhotos: [jpeg()] }, started)
    const edited = (await api.knitting.getPattern(id))!
    expect([edited.notes, edited.photos.length, edited.photos[0], edited.pdfPath]).toEqual(['Col en V', 2, keptPhoto, null])
    expect(await api.knitting.progressPhotoUrls([removed!])).toEqual({})
    expect(await (await fetch(await api.knitting.pdfUrl(started.pdfPath!))).text()).toContain('%PDF-1.4')

    // Supprimé : son projet reste, avec son PDF ; ses photos partent.
    await api.knitting.deletePattern(edited)
    expect(await api.knitting.getPattern(id)).toBeNull()
    expect((await api.knitting.getProject(project))!.pdfPath).toBe(started.pdfPath)
    expect(await api.knitting.progressPhotoUrls(edited.photos)).toEqual({})
  })

  it('garde la lecture d’un projet avec son patron, une par taille, et la rend pour le suivant', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const read = (sizeIndex: number, title: string): ReadPattern => ({ title, sizes: ['S', 'M', 'L'], sizeIndex, steps: STEPS.map((s) => ({ ...s, times: 1 })), gauge: { stitches: 22, rows: 30 } })
    const first = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: pdf(), steps: STEPS, reading: read(1, 'Pull lu en M') })
    const [library] = await api.knitting.listPatterns()
    expect(library!.readSizes).toEqual(['M'])
    const [kept] = await api.knitting.listReadings(library!.id)
    expect(kept).toMatchObject({ sizeIndex: 1, sizeLabel: 'M', reading: { title: 'Pull lu en M', sizeIndex: 1, steps: [{ title: 'Dos – côtes' }, { title: 'Emmanchures' }] } })

    // Même patron : une autre taille s'ajoute, la même taille remplace ; une lecture reprise (null) ne change rien.
    const pattern = { id: library!.id, pdfPath: library!.pdfPath }
    await api.knitting.createProject({ title: 'Pull L', size: 'L', pdf: null, steps: STEPS, pattern, reading: read(2, 'Pull lu en L') })
    await api.knitting.createProject({ title: 'Pull M bis', size: 'M', pdf: null, steps: STEPS, pattern, reading: read(1, 'Pull relu en M') })
    await api.knitting.createProject({ title: 'Pull M ter', size: 'M', pdf: null, steps: STEPS, pattern, reading: null })
    expect((await api.knitting.getPattern(library!.id))!.readSizes).toEqual(['M', 'L'])
    const readings = await api.knitting.listReadings(library!.id)
    expect(readings.map((r) => [r.sizeLabel, r.reading.title]).toSorted()).toEqual([
      ['L', 'Pull lu en L'],
      ['M', 'Pull relu en M'],
    ])
    expect(await eric.api.knitting.listReadings(library!.id)).toEqual([])

    // Patron supprimé : ses lectures partent avec lui, ses projets restent.
    await api.knitting.deletePattern((await api.knitting.getPattern(library!.id))!)
    expect(await api.knitting.listReadings(library!.id)).toEqual([])
    expect(await api.knitting.getProject(first)).not.toBeNull()
  })

  it('patron sans projet supprimé : son PDF part avec lui', async () => {
    const { api } = await signedInApi()
    const id = await api.knitting.savePattern(FIELDS, { ...NO_FILES, newPdf: pdf() }, null)
    const coat = (await api.knitting.getPattern(id))!
    await api.knitting.deletePattern(coat)
    await expect(api.knitting.downloadPdf(coat.pdfPath!, coat.title)).rejects.toThrow()
  })
})

describe('bibliothèque de patrons : erreurs', () => {
  it('refuse sans connexion, et n’enregistre rien d’invalide', async () => {
    const anon = createKnittingApi(anonClient())
    const fields: PatternFields = { title: 'Gilet', url: null, size: null, yarnIdea: '', notes: '', metersNeeded: null, needleMm: null, wish: 2 }
    await expect(anon.listPatterns()).rejects.toThrow()
    await expect(anon.getPattern(crypto.randomUUID())).rejects.toThrow()
    await expect(anon.savePattern(fields, { pdfPath: null, newPdf: pdf(), photos: [], newPhotos: [] }, null)).rejects.toThrow('Reconnecte-toi')
    await expect(anon.deletePattern({ id: crypto.randomUUID(), pdfPath: null, photos: [], projects: [] })).rejects.toThrow()
    await expect(anon.downloadPdf('perdu/perdu.pdf', 'Perdu')).rejects.toThrow('Impossible de récupérer le PDF du patron.')
    await expect(anon.saveProjectInfo(crypto.randomUUID(), { yarns: [], patternGauge: { stitches: null, rows: null } })).rejects.toThrow()

    const { api, db } = await signedInApi()
    const { data: session } = await db.auth.getSession()
    const folder = session.session!.user.id
    // Envie hors bornes : refusé, et les fichiers déjà envoyés sont retirés.
    await expect(
      api.knitting.savePattern({ ...fields, wish: 9 as 1 }, { pdfPath: null, newPdf: pdf(), photos: [], newPhotos: [new Blob(['photo'], { type: 'image/jpeg' })] }, null),
    ).rejects.toThrow()
    expect(await api.knitting.listPatterns()).toEqual([])
    expect((await db.storage.from('knit-patterns').list(folder)).data ?? []).toEqual([])
    expect((await db.storage.from('knit-photos').list(folder)).data ?? []).toEqual([])
    // Lien invalide : refusé.
    await expect(api.knitting.savePattern({ ...fields, url: 'ftp://patrons' }, { pdfPath: null, newPdf: null, photos: [], newPhotos: [] }, null)).rejects.toThrow()
    // Photo d'une autre personne : refusée.
    await expect(api.knitting.savePattern(fields, { pdfPath: null, newPdf: null, photos: [`${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`], newPhotos: [] }, null)).rejects.toThrow()
    // Projet depuis le patron d'une autre : refusé.
    const eric = await signedInApi(ERIC.email)
    const ericPattern = await eric.api.knitting.savePattern(fields, { pdfPath: null, newPdf: null, photos: [], newPhotos: [] }, null)
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, pattern: { id: ericPattern, pdfPath: null } })).rejects.toThrow()
    expect(await api.knitting.listProjects()).toEqual([])
    // Projet refusé (aucune étape) : le PDF envoyé est retiré aussi.
    await expect(api.knitting.createProject({ title: 'Pull', size: 'M', pdf: pdf(), steps: [] })).rejects.toThrow()
    expect(await api.knitting.listPatterns()).toEqual([])
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

describe('fiches de mesures', () => {
  it('ajoute, modifie et supprime des fiches, chacun les siennes', async () => {
    const { api } = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    for (const fiche of await api.knitting.listMeasures()) await api.knitting.deleteMeasures(fiche.id)
    const measures = { chest: 92.5, waist: null, hip: 98, arm: null, head: null }
    await api.knitting.saveMeasures({ id: null, name: ' Léa ', measures })
    let list = await api.knitting.listMeasures()
    expect(list).toEqual([{ id: expect.any(String), name: 'Léa', measures }])
    expect(await eric.api.knitting.listMeasures()).toEqual([])

    await api.knitting.saveMeasures({ id: list[0]!.id, name: 'Léa', measures: { ...measures, head: 55 } })
    list = await api.knitting.listMeasures()
    expect(list[0]!.measures.head).toBe(55)
    await expect(api.knitting.saveMeasures({ id: null, name: 'Moi', measures: { ...measures, chest: 5 } })).rejects.toThrow()

    await api.knitting.deleteMeasures(list[0]!.id)
    expect(await api.knitting.listMeasures()).toEqual([])
    await expect(createKnittingApi(anonClient()).listMeasures()).rejects.toThrow()
  })
})

describe('diagrammes', () => {
  const SETUP = { stepId: null, title: 'Torsade', gridTop: 0.1, gridBottom: 0.9, rows: 24, startRow: 1, repeats: true, flat: true, oddOnly: true }
  const image = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
  /** Images du dossier d'une personne (le stockage local garde celles d'autres essais). */
  const images = async (db: Awaited<ReturnType<typeof signedInApi>>['db'], folder: string) =>
    ((await db.storage.from('knit-charts').list(folder, { limit: 1000 })).data ?? []).map((f) => `${folder}/${f.name}`)

  it('ajoute un diagramme à une étape, le règle, le supprime avec son image', async () => {
    const { api, db } = await signedInApi()
    const hints = [{ page: 4, title: 'Torsade', rows: 24, step: 1, flat: true, oddOnly: false }]
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, chartHints: hints })
    let project = (await api.knitting.getProject(id))!
    expect(project.chartHints).toEqual(hints)
    expect(project.charts).toEqual([])
    const stepId = project.steps[1]!.id

    await api.knitting.addChart(id, image(), { ...SETUP, stepId })
    project = (await api.knitting.getProject(id))!
    const [chart] = project.charts
    expect(chart).toMatchObject({ ...SETUP, stepId, imagePath: expect.stringMatching(/^[0-9a-f-]+\/[0-9a-f-]+\.jpg$/) })
    // Image dans le bucket privé, lisible par l'adresse temporaire
    expect((await (await fetch(chart!.imageUrl!)).arrayBuffer()).byteLength).toBe(4)

    // En rond : les rangs endroit seuls ne s'appliquent pas
    await api.knitting.updateChart(chart!.id, { ...SETUP, stepId, rows: 12, startRow: 5, repeats: false, flat: false })
    expect((await api.knitting.getProject(id))!.charts[0]).toMatchObject({ rows: 12, startRow: 5, repeats: false, flat: false, oddOnly: false })
    // Rattaché à une sous-étape : s'arrête au dernier rang de celle-ci
    await api.knitting.updateChart(chart!.id, { ...SETUP, stepId, startRow: 5, endRow: 28 })
    expect((await api.knitting.getProject(id))!.charts[0]).toMatchObject({ startRow: 5, endRow: 28 })

    await api.knitting.deleteChart(chart!)
    expect((await api.knitting.getProject(id))!.charts).toEqual([])
    expect(await images(db, chart!.imagePath.split('/')[0]!)).not.toContain(chart!.imagePath)
  })

  it('un diagramme lié à une sous-étape la suit quand elle change d’étape', async () => {
    const { api } = await signedInApi()
    const r = (n: number, text: string, id: string) => ({ kind: 'rows' as const, rows: n, every: null, times: null, text, pattern: null, id })
    const id = await api.knitting.createProject({
      title: 'Pull',
      size: 'M',
      pdf: null,
      steps: [
        { title: 'Dos', instructions: '', totalRows: 30, stitches: null, sections: [r(10, 'côtes', 'a1'), r(20, 'torsades', 'a2')] },
        { title: 'Manche', instructions: '', totalRows: 12, stitches: null, sections: [r(12, 'côtes', 'b1')] },
      ],
    })
    let steps = (await api.knitting.getProject(id))!.steps
    await api.knitting.addChart(id, image(), { ...SETUP, stepId: steps[0]!.id, sectionId: 'a2', startRow: 11, endRow: 30 })
    const { moveSection } = await import('@/modules/tricot/lib/organize')
    await api.knitting.saveSections(moveSection(steps[0]!, 1, steps[1]!))
    const project = (await api.knitting.getProject(id))!
    steps = project.steps
    expect(project.charts[0]).toMatchObject({ stepId: steps[1]!.id, sectionId: 'a2' })
    // Placé sur ses rangs dans la manche : après les 12 rangs de côtes
    const { placeCharts } = await import('@/modules/tricot/lib/chartPlace')
    expect(placeCharts(project.charts, steps)[0]).toMatchObject({ startRow: 13, endRow: 32 })
  })

  it('supprime les images des diagrammes avec le projet ; chacun ses diagrammes', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const id = await lucile.api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })
    await lucile.api.knitting.addChart(id, image(), SETUP)
    const project = (await lucile.api.knitting.getProject(id))!
    expect(project.charts).toHaveLength(1)

    // Pas de diagramme dans le projet d'une autre (son image envoyée est retirée)
    const ericBefore = await images(eric.db, ERIC.id)
    await expect(eric.api.knitting.addChart(id, image(), SETUP)).rejects.toThrow()
    expect(await images(eric.db, ERIC.id)).toEqual(ericBefore)
    // Ni réglage ni suppression du diagramme d'une autre (rien ne change)
    await eric.api.knitting.updateChart(project.charts[0]!.id, { ...SETUP, rows: 2 })
    expect((await lucile.api.knitting.getProject(id))!.charts[0]!.rows).toBe(24)

    await lucile.api.knitting.deleteProject(project)
    expect(await images(lucile.db, LUCILE.id)).not.toContain(project.charts[0]!.imagePath)
  })

  it('refuse un calage invalide (image retirée) et l’accès sans connexion', async () => {
    const { api, db } = await signedInApi()
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS })
    const before = await images(db, LUCILE.id)
    await expect(api.knitting.addChart(id, image(), { ...SETUP, gridTop: 0.9, gridBottom: 0.1 })).rejects.toThrow('Certaines valeurs sont invalides.')
    expect(await images(db, LUCILE.id)).toEqual(before)

    await api.knitting.addChart(id, image(), SETUP)
    const chart = (await api.knitting.getProject(id))!.charts[0]!
    await expect(api.knitting.updateChart(chart.id, { ...SETUP, rows: 0 })).rejects.toThrow('Certaines valeurs sont invalides.')

    // Image trop lourde pour le bucket (10 Mo) : rien n'est enregistré
    const heavy = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/jpeg' })
    await expect(api.knitting.addChart(id, heavy, SETUP)).rejects.toThrow('Impossible d’envoyer l’image du diagramme.')
    expect((await api.knitting.getProject(id))!.charts).toHaveLength(1)

    // Image disparue du stockage : le diagramme reste, sans image
    await db.storage.from('knit-charts').remove([chart.imagePath])
    expect((await api.knitting.getProject(id))!.charts[0]!.imageUrl).toBeNull()

    const anon = createKnittingApi(anonClient())
    await expect(anon.addChart(id, image(), SETUP)).rejects.toThrow('Reconnecte-toi')
    await expect(anon.updateChart(chart.id, SETUP)).rejects.toThrow()
    await expect(anon.deleteChart(chart)).rejects.toThrow()
  })
})

describe('taille mise en valeur', () => {
  it('garde les tailles du patron et la taille mise en valeur, réglable', async () => {
    const { api } = await signedInApi()
    const steps = [{ ...STEPS[0]!, instructions: 'Monter 60 (64-68) m. '.repeat(400) }]
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps, sizes: ['S', 'M', 'L'], sizeIndex: 1 })
    let project = (await api.knitting.getProject(id))!
    expect(project).toMatchObject({ sizes: ['S', 'M', 'L'], sizeIndex: 1, chartHints: [] })
    // Texte recopié tel quel, plus long qu'avant (5 000 caractères)
    expect(project.steps[0]!.instructions).toHaveLength(steps[0]!.instructions.length)

    await api.knitting.setSizeIndex(id, 2)
    expect((await api.knitting.getProject(id))!.sizeIndex).toBe(2)
    // La liste montre la taille suivie (celle choisie), pas celle de l'import
    expect((await api.knitting.listProjects()).find((p) => p.id === id)!.size).toBe('L')
    await api.knitting.setSizeIndex(id, null)
    expect((await api.knitting.getProject(id))!.sizeIndex).toBeNull()
    expect((await api.knitting.listProjects()).find((p) => p.id === id)!.size).toBe('M')
    await expect(api.knitting.setSizeIndex(id, 3)).rejects.toThrow('Certaines valeurs sont invalides.')

    // Surlignage corrigé à la main, par taille
    const stepId = project.steps[0]!.id
    await api.knitting.saveProgress(stepId, { highlights: { '1': { '11': false, '14': true } } })
    expect((await api.knitting.getProject(id))!.steps[0]!.highlights).toEqual({ '1': { '11': false, '14': true } })
    await expect(api.knitting.saveProgress(stepId, { highlights: [] as never })).rejects.toThrow('Certaines valeurs sont invalides.')

    // Taille hors de la liste à la création : pas de mise en valeur ; sans tailles : rien à enregistrer
    const other = await api.knitting.createProject({ title: 'Bonnet', size: 'M', pdf: null, steps: STEPS, sizes: ['S', 'M'], sizeIndex: 5 })
    project = (await api.knitting.getProject(other))!
    expect(project).toMatchObject({ sizes: ['S', 'M'], sizeIndex: null })
    const plain = await api.knitting.createProject({ title: 'Écharpe', size: 'Unique', pdf: null, steps: STEPS, sizeIndex: 0 })
    expect((await api.knitting.getProject(plain))!).toMatchObject({ sizes: [], sizeIndex: null })
  })
})


describe('aides pendant le tricot', () => {
  it('garde les abréviations du patron, la traduction d’une étape et la pesée de la laine', async () => {
    const { api } = await signedInApi()
    const abbreviations = [{ abbr: 'C4F', meaning: 'Torsade de 4 mailles devant.' }]
    const id = await api.knitting.createProject({ title: 'Pull', size: 'M', pdf: null, steps: STEPS, abbreviations })
    let project = (await api.knitting.getProject(id))!
    expect(project).toMatchObject({ abbreviations, yarnChecks: [] })
    expect(project.steps[0]!.translation).toBeNull()

    await api.knitting.saveProgress(project.steps[0]!.id, { translation: 'Monter 60 (64-68) m.' })
    const checks = [
      { yarn: 0, grams: 82.5, rowsDone: 40, at: '2026-11-08T10:00:00.000Z' },
      { yarn: 1, grams: 30, rowsDone: 40, at: '2026-11-08T10:00:00.000Z' },
    ]
    await api.knitting.saveYarnChecks(id, checks)
    project = (await api.knitting.getProject(id))!
    expect(project.steps[0]!.translation).toBe('Monter 60 (64-68) m.')
    expect(project.yarnChecks).toEqual(checks)

    await api.knitting.saveYarnChecks(id, [])
    expect((await api.knitting.getProject(id))!.yarnChecks).toEqual([])
    await expect(api.knitting.saveYarnChecks(id, [{ yarn: 0, grams: -1, rowsDone: 0, at: '' }])).rejects.toThrow('Certaines valeurs sont invalides.')
    await expect(api.knitting.saveYarnChecks(id, [checks[0]!, checks[0]!])).rejects.toThrow('Certaines valeurs sont invalides.')
  })

  it('lit le glossaire des abréviations classiques, par langue', async () => {
    const { api } = await signedInApi()
    const glossary = await api.knitting.getGlossary()
    expect(glossary.en.find((a) => a.abbr === 'k2tog')?.meaning).toMatch(/2 mailles ensemble/)
    expect(glossary.fr.find((a) => a.abbr === 'jeté')).toBeDefined()
    expect(glossary.fr.find((a) => a.abbr === 'k2tog')).toBeUndefined()
  })

  it('pose une question et traduit (sans clé d’analyse en local)', async () => {
    const { api } = await signedInApi()
    await expect(api.knitting.askAboutStep({ question: 'ssk ?', stepTitle: 'Dos', text: 'ssk', row: 3, size: 'M', abbreviations: [{ abbr: 'ssk', meaning: 'Surjet.' }] })).rejects.toThrow(
      'Le service d’analyse est mal configuré.',
    )
    await expect(api.knitting.translateText('Knit to end.')).rejects.toThrow('Le service d’analyse est mal configuré.')
  })
})

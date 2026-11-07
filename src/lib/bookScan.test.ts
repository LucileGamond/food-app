import {
  addCapture,
  allRead,
  closeAll,
  MAX_GROUP_IMAGES,
  newSession,
  nextReadyAt,
  pageCount,
  readyToRead,
  resumeSession,
  retryErrors,
  canInsist,
  insistOnRecipe,
  scanCounts,
  startNewRecipe,
  undoLast,
  UNDO_DELAY_MS,
  updateGroup,
  type ScanSession,
} from './bookScan'

const ids = () => {
  let n = 0
  return () => `g${++n}`
}

/** Prend une suite de photos (chacune : ses images) à 1 s d'intervalle. */
function shoot(session: ScanSession, photos: string[][], newId = ids()): ScanSession {
  return photos.reduce((s, images, i) => addCapture(s, images, i * 1000, newId), session)
}

describe('session de scan', () => {
  it('1 photo = 1 recette : chaque photo forme une recette, envoyée après le délai d’annulation', () => {
    const session = shoot(newSession('Pâtisserie maison', false), [['a'], ['b1', 'b2']])
    expect(session.groups.map((g) => [g.images, g.closed])).toEqual([
      [['a'], true],
      [['b1', 'b2'], true],
    ])
    expect(pageCount(session)).toBe(3)
    expect(readyToRead(session, 1000, 2).map((g) => g.id)).toEqual([])
    expect(nextReadyAt(session, 1000)).toBe(UNDO_DELAY_MS)
    expect(readyToRead(session, UNDO_DELAY_MS, 2).map((g) => g.id)).toEqual(['g1'])
    expect(readyToRead(session, 10_000, 1).map((g) => g.id)).toEqual(['g1'])
    expect(readyToRead(session, 10_000, 0)).toEqual([])
    expect(nextReadyAt(session, 10_000)).toBeNull()
  })

  it('plusieurs photos par recette : « Nouvelle recette » ferme la recette en cours', () => {
    const newId = ids()
    let session = shoot(newSession('Livre', true), [['p1'], ['p2']], newId)
    expect(session.groups).toHaveLength(1)
    expect(session.groups[0]).toMatchObject({ images: ['p1', 'p2'], closed: false })
    expect(readyToRead(session, 99_000, 2)).toEqual([])

    session = startNewRecipe(session, 2000, newId, false)
    expect(session.groups[0]).toMatchObject({ closed: true, readyAt: 2000 })
    session = addCapture(session, ['p3'], 3000, newId)
    expect(session.groups.map((g) => g.images)).toEqual([['p1', 'p2'], ['p3']])
    // Sans recette en cours, le bouton ne fait rien.
    const closed = closeAll(session, 4000)
    expect(startNewRecipe(closed, 5000, newId, true)).toBe(closed)
  })

  it('page qui finit une recette et commence la suivante : elle compte pour les deux', () => {
    const newId = ids()
    let session = shoot(newSession('Livre', true), [['p1'], ['p2']], newId)
    session = startNewRecipe(session, 2000, newId, true)
    expect(session.groups.map((g) => [g.images, g.closed])).toEqual([
      [['p1', 'p2'], true],
      [['p2'], false],
    ])
    session = addCapture(session, ['p3'], 3000, newId)
    expect(session.groups[1]!.images).toEqual(['p2', 'p3'])
    expect(pageCount(session)).toBe(3)
  })

  it('recette de plus de 4 photos : le groupe part et le suivant reprend sa dernière page', () => {
    const photos = Array.from({ length: MAX_GROUP_IMAGES + 1 }, (_, i) => [`p${i + 1}`])
    const session = shoot(newSession('Livre', true), photos)
    expect(session.groups.map((g) => [g.images, g.closed])).toEqual([
      [['p1', 'p2', 'p3', 'p4'], true],
      [['p4', 'p5'], false],
    ])
  })

  it('fin du scan : la recette en cours part, une recette vide (page reprise seule) est abandonnée', () => {
    const newId = ids()
    const session = startNewRecipe(shoot(newSession('Livre', true), [['p1']], newId), 1000, newId, true)
    const closed = closeAll(session, 1500)
    expect(closed.groups.map((g) => [g.images, g.closed, g.readyAt])).toEqual([[['p1'], true, 1000]])
    expect(closeAll(shoot(newSession('Livre', true), [['p1']]), 500).groups[0]).toMatchObject({ closed: true, readyAt: 500 })
  })

  it('annule la dernière photo tant que sa recette n’est pas partie', () => {
    const newId = ids()
    let session = shoot(newSession('Livre', false), [['a'], ['b']], newId)
    const undone = undoLast(session)!
    expect(undone.removed).toEqual(['b'])
    expect(undone.session.groups.map((g) => g.images)).toEqual([['a']])
    expect(pageCount(undone.session)).toBe(1)

    session = updateGroup(undone.session, 'g1', { status: 'reading' })
    expect(undoLast(session)).toBeNull()
    expect(undoLast(newSession('Livre', false))).toBeNull()
  })

  it('annule une photo d’une recette sur plusieurs pages, sans supprimer une page encore utilisée', () => {
    const newId = ids()
    let session = shoot(newSession('Livre', true), [['p1'], ['p2']], newId)
    let undone = undoLast(session)!
    expect(undone.session.groups.map((g) => g.images)).toEqual([['p1']])

    // La page reprise (p2) reste dans la recette précédente : seule p3 est supprimée, la recette reprise aussi.
    session = addCapture(startNewRecipe(session, 2000, newId, true), ['p3'], 3000, newId)
    undone = undoLast(session)!
    expect(undone.removed).toEqual(['p3'])
    expect(undone.session.groups.map((g) => g.images)).toEqual([['p1', 'p2']])
  })

  it('reprend une session interrompue et relance les erreurs', () => {
    let session = shoot(newSession('Livre', false), [['a'], ['b'], ['c']])
    session = updateGroup(session, 'g1', { status: 'reading' })
    session = updateGroup(session, 'g2', { status: 'error', message: 'Erreur' })
    session = updateGroup(session, 'g3', { status: 'done', recipes: [{ status: 'saved', title: 'Tarte' }] })
    expect(scanCounts(session)).toMatchObject({ pages: 3, waiting: 1, reading: 1, saved: 1, error: 1 })
    expect(allRead(session)).toBe(false)

    const resumed = resumeSession(session)
    expect(resumed.groups[0]).toMatchObject({ status: 'pending', readyAt: 0 })
    const retried = retryErrors(resumed)
    expect(retried.groups[1]).toMatchObject({ status: 'pending', message: undefined })
    expect(retried.groups[2]!.status).toBe('done')
    expect(allRead(updateGroup(updateGroup(session, 'g1', { status: 'skipped' }), 'g2', { status: 'done' }))).toBe(true)
  })

  it('« C’est une recette » : une page ignorée repart à la lecture en insistant, une seule fois', () => {
    let session = shoot(newSession('Livre', false), [['a'], ['b']])
    session = updateGroup(updateGroup(session, 'g1', { status: 'skipped', message: 'Pas une recette' }), 'g2', { status: 'done' })
    expect(session.groups.map(canInsist)).toEqual([true, false])
    session = insistOnRecipe(session, 'g1')
    expect(session.groups[0]).toMatchObject({ status: 'pending', insist: true, readyAt: 0, message: undefined })
    expect(insistOnRecipe(session, 'g2').groups[1]!.status).toBe('done')
    // Toujours rien après la relecture : plus de relecture proposée.
    session = updateGroup(session, 'g1', { status: 'skipped' })
    expect(canInsist(session.groups[0]!)).toBe(false)
    expect(insistOnRecipe(session, 'g1').groups[0]!.status).toBe('skipped')
  })
})

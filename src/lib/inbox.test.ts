import { canPrefill, extractUrl, inboxKind, inboxSubtitle, parseInboxInput, photosTitle } from './inbox'

describe('liste « À planifier »', () => {
  it('distingue recette, lien et idée', () => {
    expect(inboxKind({ url: null, recipe_id: 'r1' })).toBe('recipe')
    expect(inboxKind({ url: 'https://www.marmiton.org/a', recipe_id: null })).toBe('link')
    expect(inboxKind({ url: null, recipe_id: null })).toBe('idea')
    expect(inboxSubtitle({ url: null, recipe_id: 'r1' })).toBe('Recette enregistrée')
    expect(inboxSubtitle({ url: 'https://www.marmiton.org/a', recipe_id: null })).toBe('marmiton.org')
    expect(inboxSubtitle({ url: null, recipe_id: null })).toBe('Idée')
  })

  it('reconnaît les photos en attente, et ce qui peut être prérempli', () => {
    const photos = { url: null, recipe_id: null, photos: ['pending/a.jpg', 'pending/b.jpg'] }
    expect(inboxKind(photos)).toBe('photos')
    expect(inboxSubtitle(photos)).toBe('2 photos')
    expect(inboxSubtitle({ ...photos, photos: ['pending/a.jpg'] })).toBe('1 photo')
    expect(inboxKind({ url: null, recipe_id: null, photos: [] })).toBe('idea')
    expect(canPrefill(photos)).toBe(true)
    expect(canPrefill({ url: 'https://e.fr/a', recipe_id: null })).toBe(true)
    expect(canPrefill({ url: null, recipe_id: 'r1' })).toBe(false)
    expect(canPrefill({ url: null, recipe_id: null })).toBe(false)
    expect(photosTitle(new Date(2026, 10, 1))).toBe('Photos du 1 nov.')
  })

  it('trouve le lien d’un texte partagé', () => {
    expect(extractUrl('Regarde ça https://www.marmiton.org/recettes/crepes.aspx, trop bon !')).toBe('https://www.marmiton.org/recettes/crepes.aspx')
    expect(extractUrl('(https://exemple.fr/a)')).toBe('https://exemple.fr/a')
    expect(extractUrl('pas de lien')).toBeNull()
    expect(extractUrl(null)).toBeNull()
  })

  it('transforme une saisie en lien ou en idée', () => {
    expect(parseInboxInput('  https://www.marmiton.org/recettes/crepes.aspx ')).toEqual({
      kind: 'link',
      url: 'https://www.marmiton.org/recettes/crepes.aspx',
      title: 'marmiton.org',
    })
    expect(parseInboxInput('https://exemple.fr/r', '  Pâte   à crêpes ')).toEqual({ kind: 'link', url: 'https://exemple.fr/r', title: 'Pâte à crêpes' })
    expect(parseInboxInput('  Raclette   party ')).toEqual({ kind: 'idea', title: 'Raclette party' })
    expect(parseInboxInput('', 'Titre seul')).toEqual({ kind: 'idea', title: 'Titre seul' })
    expect(parseInboxInput('   ')).toBeNull()
    expect(parseInboxInput('x'.repeat(300))).toMatchObject({ title: 'x'.repeat(200) })
  })
})

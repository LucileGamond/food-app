import { AppError } from '@/api'
import { createInboxApi } from '@/api/inbox'
import { ERIC, LUCILE, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

const curry = {
  id: null,
  title: 'Curry maison',
  notes: null,
  url: 'https://exemple.fr/curry',
  servings: 2,
  tags: [],
  ingredients: [{ name: 'riz', quantity: 200, unit: 'g', note: null }],
}

describe('inbox api (liste « À planifier »)', () => {
  it('ajoute des liens, idées et recettes, refuse les doublons, renomme et retire', async () => {
    const { api } = await signedInApi()
    const linkId = await api.inbox.addItem({ url: 'https://www.exemple.fr/crepes', title: 'exemple.fr' })
    await api.inbox.addItem({ title: 'Raclette' })
    const curryId = await api.recipes.saveRecipe(curry)
    // Lien d'une recette enregistrée → élément recette
    await api.inbox.addItem({ url: 'https://exemple.fr/curry/', title: 'Titre de la page' })

    let items = await api.inbox.listItems()
    expect(items.map((i) => [i.title, i.url, i.recipe_id])).toEqual([
      ['exemple.fr', 'https://www.exemple.fr/crepes', null],
      ['Raclette', null, null],
      ['Curry maison', null, curryId],
    ])

    await expect(api.inbox.addItem({ url: 'http://exemple.fr/crepes', title: 'x' })).rejects.toThrow('Déjà dans la liste « À planifier ».')
    await expect(api.inbox.addItem({ recipeId: curryId })).rejects.toThrow('Déjà dans la liste')
    await expect(api.inbox.addItem({ title: ' ' })).rejects.toBeInstanceOf(AppError)

    await api.inbox.renameItem(linkId, '  Pâte à crêpes ')
    await api.inbox.deleteItem(items[1]!.id)
    items = await api.inbox.listItems()
    expect(items.map((i) => i.title)).toEqual(['Pâte à crêpes', 'Curry maison'])
  })

  it('planifie un élément : repas créé et élément retiré', async () => {
    const { api } = await signedInApi()
    const linkId = await api.inbox.addItem({ url: 'https://exemple.fr/crepes', title: 'Crêpes' })
    const curryId = await api.recipes.saveRecipe(curry)
    const recipeItemId = await api.inbox.addItem({ recipeId: curryId })

    await api.inbox.planItem(linkId, '2026-10-22', 'DINNER', [LUCILE.id, ERIC.id])
    await api.inbox.planItem(recipeItemId, '2026-10-23', 'LUNCH', [LUCILE.id])
    expect(await api.inbox.listItems()).toEqual([])

    const meals = await api.meals.listMeals('2026-10-22', '2026-10-23')
    expect(meals.map((m) => [m.meal_date, m.slot, m.people.length, m.recipe.title, m.recipe.is_saved, m.recipe.url])).toEqual([
      ['2026-10-22', 'DINNER', 2, 'Crêpes', false, 'https://exemple.fr/crepes'],
      ['2026-10-23', 'LUNCH', 1, 'Curry maison', true, 'https://exemple.fr/curry'],
    ])
    await expect(api.inbox.planItem(linkId, '2026-10-24', 'LUNCH', [LUCILE.id])).rejects.toThrow('Élément introuvable')
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createInboxApi(anonClient())
    await expect(api.listItems()).rejects.toThrow(/accès/)
    await expect(api.addItem({ title: 'Raclette' })).rejects.toBeInstanceOf(AppError)
    await expect(api.renameItem(LUCILE.id, 'x')).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteItem(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.planItem(LUCILE.id, '2026-10-22', 'LUNCH', [LUCILE.id])).rejects.toBeInstanceOf(AppError)
    expect(await api.fetchTitle('https://exemple.fr')).toBeNull()
  })

  it('récupère le titre d’une page via la fonction (adresse refusée → null)', async () => {
    const { api } = await signedInApi()
    expect(await api.inbox.fetchTitle('http://localhost/')).toBeNull()
  })

  it('prévient en temps réel des ajouts de l’autre personne', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    let events = 0
    let status = ''
    const unsubscribe = lucile.api.inbox.subscribe(
      () => {
        events += 1
      },
      (s) => {
        status = s
      },
    )
    try {
      await waitFor(() => status === 'SUBSCRIBED', 20000)
      const deadline = Date.now() + 30000
      let n = 0
      while (events === 0 && Date.now() < deadline) {
        await eric.api.inbox.addItem({ title: `Idée ${n++}` })
        await waitFor(() => events > 0, 2000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)
})

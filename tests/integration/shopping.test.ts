import { AppError } from '@/api'
import { createPushApi } from '@/api/push'
import { createShoppingApi } from '@/api/shopping'
import { createAppClient } from '@/lib/supabase'
import { ERIC, LOCAL_SERVICE_KEY, LOCAL_URL, LUCILE, anonClient, resetData, signedInApi, waitFor } from './helpers'

beforeEach(async () => {
  await resetData()
})

const admin = () => createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })

describe('shopping api', () => {
  it('crée, renomme et supprime des listes, avec leur avancement', async () => {
    const { api } = await signedInApi()
    const courses = await api.shopping.createList('  Courses du 25 oct. ')
    const apero = await api.shopping.createList('Apéro')
    await api.shopping.addItem(courses, { name: 'Farine', quantity: 500, unit: 'g', aisle: 'EPICERIE_SALEE' }, 0)
    const lait = await api.shopping.addItem(courses, { name: 'Lait', quantity: null, unit: null, aisle: 'CREMERIE' }, 1)
    await api.shopping.updateItem(lait.id, { checked: true })

    let lists = await api.shopping.listLists()
    // La liste modifiée en dernier vient en premier
    expect(lists.map((l) => [l.name, l.total, l.checked])).toEqual([
      ['Courses du 25 oct.', 2, 1],
      ['Apéro', 0, 0],
    ])
    expect(await api.shopping.getList(courses)).toEqual({ id: courses, name: 'Courses du 25 oct.' })

    await api.shopping.renameList(apero, 'Apéro samedi')
    await api.shopping.deleteList(courses)
    lists = await api.shopping.listLists()
    expect(lists.map((l) => l.name)).toEqual(['Apéro samedi'])
    expect(await api.shopping.getList(courses)).toBeNull()
    await expect(api.shopping.createList(' ')).rejects.toBeInstanceOf(AppError)
  })

  it('gère les articles : ajout, modification, cochés, suppression', async () => {
    const { api } = await signedInApi()
    const list = await api.shopping.createList('Courses')
    const farine = await api.shopping.addItem(list, { name: 'Farine', quantity: 0.5, unit: 'kg', aisle: 'EPICERIE_SALEE' }, 0)
    expect(farine).toMatchObject({ list_id: list, name: 'Farine', quantity: 0.5, unit: 'kg', aisle: 'EPICERIE_SALEE', checked: false, position: 0 })
    const pain = await api.shopping.addItem(list, { name: 'Pain', quantity: null, unit: null, aisle: 'BOULANGERIE' }, 1)
    const sel = await api.shopping.addItem(list, { name: 'Sel', quantity: null, unit: null, aisle: 'AUTRE' }, 2)

    await api.shopping.updateItem(farine.id, { name: 'Farine T65', quantity: 1, unit: 'kg', aisle: 'EPICERIE_SALEE' })
    await api.shopping.updateItem(pain.id, { checked: true })
    await api.shopping.deleteItem(sel.id)
    expect((await api.shopping.listItems(list)).map((i) => [i.name, i.quantity, i.checked])).toEqual([
      ['Farine T65', 1, false],
      ['Pain', null, true],
    ])

    await api.shopping.clearChecked(list)
    expect((await api.shopping.listItems(list)).map((i) => i.name)).toEqual(['Farine T65'])

    await expect(api.shopping.addItem(list, { name: 'Sel', quantity: null, unit: 'pluche', aisle: 'AUTRE' }, 3)).rejects.toBeInstanceOf(AppError)
    await expect(api.shopping.updateItem(farine.id, { quantity: -1 })).rejects.toBeInstanceOf(AppError)
  })

  it('journalise les modifications pour les notifications', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    const list = await lucile.api.shopping.createList('Courses')
    const farine = await lucile.api.shopping.addItem(list, { name: 'Farine', quantity: null, unit: null, aisle: 'AUTRE' }, 0)
    await eric.api.shopping.updateItem(farine.id, { checked: true })

    const { data, error } = await admin().from('shopping_events').select('kind, item_name, actor_id').order('id')
    expect(error).toBeNull()
    expect(data).toEqual([
      { kind: 'ADDED', item_name: 'Farine', actor_id: LUCILE.id },
      { kind: 'CHECKED', item_name: 'Farine', actor_id: ERIC.id },
    ])
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createShoppingApi(anonClient())
    await expect(api.listLists()).rejects.toThrow(/accès/)
    await expect(api.getList(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.createList('Courses')).rejects.toBeInstanceOf(AppError)
    await expect(api.renameList(LUCILE.id, 'x')).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteList(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.listItems(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.addItem(LUCILE.id, { name: 'x', quantity: null, unit: null, aisle: 'AUTRE' }, 0)).rejects.toBeInstanceOf(AppError)
    await expect(api.updateItem(LUCILE.id, { checked: true })).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteItem(LUCILE.id)).rejects.toBeInstanceOf(AppError)
    await expect(api.clearChecked(LUCILE.id)).rejects.toBeInstanceOf(AppError)
  })

  it('prévient en temps réel quand l’autre coche un article', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    const list = await lucile.api.shopping.createList('Courses')
    const item = await lucile.api.shopping.addItem(list, { name: 'Lait', quantity: null, unit: null, aisle: 'CREMERIE' }, 0)
    let events = 0
    let status = ''
    const unsubscribe = lucile.api.shopping.subscribe(
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
      let checked = false
      while (events === 0 && Date.now() < deadline) {
        checked = !checked
        await eric.api.shopping.updateItem(item.id, { checked })
        await waitFor(() => events > 0, 2000).catch(() => undefined)
      }
      expect(events).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  }, 60000)
})

describe('push api', () => {
  const device = { endpoint: 'https://push.exemple/tel', p256dh: 'cle', auth: 'secret', userAgent: 'Android' }

  it('enregistre, vérifie et supprime l’abonnement de cet appareil', async () => {
    const lucile = await signedInApi(LUCILE.email)
    const eric = await signedInApi(ERIC.email)
    await lucile.api.push.saveSubscription(device)
    expect(await lucile.api.push.isSubscribed(device.endpoint)).toBe(true)
    // Chacun ne voit que ses appareils
    expect(await eric.api.push.isSubscribed(device.endpoint)).toBe(false)

    // Le même téléphone utilisé avec le compte d'Eric : l'abonnement passe à Eric
    await eric.api.push.saveSubscription({ ...device, p256dh: 'cle2' })
    expect(await eric.api.push.isSubscribed(device.endpoint)).toBe(true)
    expect(await lucile.api.push.isSubscribed(device.endpoint)).toBe(false)

    await eric.api.push.deleteSubscription(device.endpoint)
    expect(await eric.api.push.isSubscribed(device.endpoint)).toBe(false)
    await expect(eric.api.push.saveSubscription({ ...device, endpoint: 'http://non-securise' })).rejects.toBeInstanceOf(AppError)
  })

  it('refuse tout accès sans connexion', async () => {
    const api = createPushApi(anonClient())
    await expect(api.saveSubscription(device)).rejects.toBeInstanceOf(AppError)
    await expect(api.isSubscribed(device.endpoint)).rejects.toBeInstanceOf(AppError)
    await expect(api.deleteSubscription(device.endpoint)).rejects.toBeInstanceOf(AppError)
  })
})

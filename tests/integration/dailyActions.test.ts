import { createActivityApi } from '@/api/activity'
import { createAppClient } from '@/api/client'
import { ERIC, LOCAL_ANON_KEY, anonClient, LOCAL_SERVICE_KEY, LOCAL_URL, LUCILE, resetData, signedInApi } from './helpers'

beforeEach(async () => {
  await resetData()
})

const admin = () => createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })

/** Appel du service worker (public/push-sw.js) : clé publique, sans session. */
function runAction(token: string, action: string) {
  return fetch(`${LOCAL_URL}/rest/v1/rpc/run_notification_action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: LOCAL_ANON_KEY, authorization: `Bearer ${LOCAL_ANON_KEY}` },
    body: JSON.stringify({ p_token: token, p_action: action }),
  })
}

describe('boutons des notifications', () => {
  it('note un verre avec le jeton de la notification, une seule fois', async () => {
    const lucile = await signedInApi()
    const { data: token, error } = await admin().rpc('create_notification_action', { p_profile_id: LUCILE.id, p_kind: 'water', p_payload: { volumes: [200, 750] } })
    expect(error).toBeNull()

    const response = await runAction(token!, 'drink:750')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'water', volume_ml: 750, drunk_ml: 750, goal_ml: 1500 })
    expect((await lucile.api.hydration.listIntakes(new Date(Date.now() - 60_000))).map((i) => i.volume_ml)).toEqual([750])

    expect((await runAction(token!, 'drink:750')).ok).toBe(false)
    expect((await runAction(crypto.randomUUID(), 'drink:200')).ok).toBe(false)
  })

  it('note l’arrosage des plantes au nom de la personne prévenue', async () => {
    const lucile = await signedInApi()
    const plantId = await lucile.api.plants.savePlant({ name: 'Ficus', species: null, location: null, planted_on: null, planted_height_cm: null, pot_diameter_cm: null, notes: null }, [])
    const { data: token } = await admin().rpc('create_notification_action', {
      p_profile_id: ERIC.id,
      p_kind: 'plants',
      p_payload: { waterings: [{ plant_id: plantId, rule_id: null, scheduled_on: '2026-11-10', amount_ml: 250 }] },
    })
    expect(await (await runAction(token!, 'watered')).json()).toEqual({ kind: 'plants', count: 1 })
    const [event] = await lucile.api.plants.listEvents({ plantId })
    expect(event).toMatchObject({ done_by: ERIC.id, scheduled_on: '2026-11-10', amount_ml: 250 })
  })
})

describe('ce que l’autre a fait', () => {
  it('liste les gestes des autres, pas les siens', async () => {
    const lucile = await signedInApi()
    const eric = await signedInApi(ERIC.email)
    const list = await eric.api.shopping.createList('Courses')
    await eric.api.shopping.addItem(list, { name: 'Lait', quantity: null, unit: null, aisle: 'CREMERIE' }, 0)
    const plantId = await lucile.api.plants.savePlant({ name: 'Ficus', species: null, location: null, planted_on: null, planted_height_cm: null, pot_diameter_cm: null, notes: null }, [])
    await eric.api.plants.water({ plantId, scheduledOn: null, ruleId: null, amountMl: 200 })

    const seen = await lucile.api.activity.listRecent()
    expect(seen.map((e) => `${e.kind} ${e.actorName} ${e.title} ${e.detail ?? ''}`).sort()).toEqual(['shopping_added Eric Lait Courses', 'watered Eric Ficus '])
    expect(seen.find((e) => e.kind === 'watered')).toMatchObject({ actorId: ERIC.id, targetId: plantId })
    expect((await eric.api.activity.listRecent()).map((e) => e.kind)).toEqual(['plant_added'])
    // Hors de la période : rien.
    expect(await lucile.api.activity.listRecent(new Date(Date.now() + 4 * 86_400_000))).toEqual([])
    // Sans connexion : refusé.
    await expect(createActivityApi(anonClient()).listRecent()).rejects.toThrow()
  })
})

import code from '../../public/share-sw.js?raw'
import { SHARED_PHOTOS_CACHE } from './sharedPhotos'

const ORIGIN = 'https://food.exemple'

/** Charge public/share-sw.js avec un faux service worker et un faux Cache API. */
function loadWorker(failingCache = false) {
  const listeners: ((event: unknown) => void)[] = []
  const stores = new Map<string, Map<string, Response>>()
  const caches = {
    open: async (name: string) => {
      if (failingCache) throw new Error('stockage plein')
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)!
      return { put: async (key: string, response: Response) => void store.set(key, response) }
    },
    delete: async (name: string) => stores.delete(name),
  }
  const self = { location: { origin: ORIGIN }, addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.push(listener) }
  new Function('self', 'caches', code)(self, caches)

  async function share(form: FormData, path = '/partage', method = 'POST'): Promise<Response | null> {
    let responded: Promise<Response> | null = null
    const request = { url: `${ORIGIN}${path}`, method, formData: async () => form }
    for (const listener of listeners) listener({ request, respondWith: (r: Promise<Response>) => (responded = r) })
    return responded ? await responded : null
  }
  return { share, stores }
}

describe('cible de partage (service worker)', () => {
  it('range les photos partagées (2 au plus) et ouvre « Nouvelle recette »', async () => {
    const { share, stores } = loadWorker()
    const form = new FormData()
    for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) form.append('photos', new File(['img'], name, { type: 'image/jpeg' }))
    form.append('photos', new File(['%PDF'], 'd.pdf', { type: 'application/pdf' }))
    const response = (await share(form))!
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/recettes/nouvelle?photos=partage`)
    const stored = stores.get(SHARED_PHOTOS_CACHE)!
    expect([...stored.keys()]).toEqual([`${ORIGIN}/photo-partagee/0`, `${ORIGIN}/photo-partagee/1`])
    expect(stored.get(`${ORIGIN}/photo-partagee/0`)!.headers.get('content-type')).toBe('image/jpeg')
  })

  it('renvoie un lien ou un texte vers la liste « À planifier »', async () => {
    const { share, stores } = loadWorker()
    const form = new FormData()
    form.append('title', 'Tarte tatin')
    form.append('text', 'Regarde https://cuisine.exemple.fr/tatin')
    form.append('url', ' ')
    const response = (await share(form))!
    expect(response.headers.get('location')).toBe(`${ORIGIN}/partage?title=Tarte+tatin&text=Regarde+https%3A%2F%2Fcuisine.exemple.fr%2Ftatin`)
    expect(stores.size).toBe(0)
  })

  it('ouvre quand même l’application si les photos ne peuvent pas être rangées', async () => {
    const { share } = loadWorker(true)
    const form = new FormData()
    form.append('photos', new File(['img'], 'a.jpg', { type: 'image/jpeg' }))
    const response = (await share(form))!
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/recettes/nouvelle?photos=partage`)
  })

  it('laisse passer les autres requêtes', async () => {
    const { share } = loadWorker()
    expect(await share(new FormData(), '/partage', 'GET')).toBeNull()
    expect(await share(new FormData(), '/autre')).toBeNull()
  })
})

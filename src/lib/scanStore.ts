// Scan de livre : la session et ses photos gardées sur le téléphone (IndexedDB), pour reprendre après une fermeture.
// Sans IndexedDB (tests), une mémoire tient lieu de stockage le temps de la page.

import type { ScanSession } from './bookScan'

export interface ScanStore {
  load(): Promise<ScanSession | null>
  save(session: ScanSession): Promise<void>
  putImage(id: string, image: Blob): Promise<void>
  getImage(id: string): Promise<Blob | undefined>
  deleteImages(ids: string[]): Promise<void>
  /** Session terminée : tout est effacé. */
  clear(): Promise<void>
}

const DB_NAME = 'life-book-scan'
const SESSION_KEY = 'current'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbStore(): ScanStore {
  let opened: Promise<IDBDatabase> | null = null
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('session')
        req.result.createObjectStore('images')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(store: 'session' | 'images', mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) => {
    const tx = (await db()).transaction(store, mode)
    return request(action(tx.objectStore(store)))
  }
  return {
    load: async () => ((await run('session', 'readonly', (s) => s.get(SESSION_KEY))) as ScanSession | undefined) ?? null,
    save: async (session) => void (await run('session', 'readwrite', (s) => s.put(session, SESSION_KEY))),
    putImage: async (id, image) => void (await run('images', 'readwrite', (s) => s.put(image, id))),
    getImage: async (id) => (await run('images', 'readonly', (s) => s.get(id))) as Blob | undefined,
    deleteImages: async (ids) => void (await Promise.all(ids.map((id) => run('images', 'readwrite', (s) => s.delete(id))))),
    clear: async () => {
      await run('session', 'readwrite', (s) => s.clear())
      await run('images', 'readwrite', (s) => s.clear())
    },
  }
}

export function memoryScanStore(): ScanStore {
  let session: ScanSession | null = null
  const images = new Map<string, Blob>()
  return {
    load: async () => session,
    save: async (s) => void (session = s),
    putImage: async (id, image) => void images.set(id, image),
    getImage: async (id) => images.get(id),
    deleteImages: async (ids) => ids.forEach((id) => images.delete(id)),
    clear: async () => {
      session = null
      images.clear()
    },
  }
}

let store: ScanStore | null = null

/** Le stockage du scan (le même pour toute l'application). */
export function scanStore(): ScanStore {
  return (store ??= typeof indexedDB === 'undefined' ? memoryScanStore() : idbStore())
}

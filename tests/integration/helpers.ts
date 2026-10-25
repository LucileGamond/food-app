import { createApi } from '@/api'
import { createAppClient, type AppSupabaseClient } from '@/lib/supabase'

// Clés publiques de démonstration de la Supabase locale (identiques sur toutes les installations).
export const LOCAL_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Comptes de test créés par supabase/seed.sql
export const LUCILE = { id: '11111111-1111-1111-1111-111111111111', email: 'lucile@food.test' }
export const ERIC = { id: '22222222-2222-2222-2222-222222222222', email: 'eric@food.test' }
export const TEST_PASSWORD = 'motdepasse-test'

export function anonClient(): AppSupabaseClient {
  return createAppClient(LOCAL_URL, LOCAL_ANON_KEY, { persistSession: false })
}

export async function signedInClient(email: string): Promise<AppSupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw error
  return client
}

export async function signedInApi(email = LUCILE.email) {
  const db = await signedInClient(email)
  return { db, api: createApi(db) }
}

/** Vide les données métier (les comptes et profils sont conservés). */
export async function resetData(): Promise<void> {
  const admin = createAppClient(LOCAL_URL, LOCAL_SERVICE_KEY, { persistSession: false })
  const nil = '00000000-0000-0000-0000-000000000000'
  for (const table of ['planning_inbox', 'meals', 'recipe_photos', 'recipe_ingredients', 'recipes', 'weight_entries', 'food_periods', 'food_plan_items', 'shopping_lists', 'push_subscriptions'] as const) {
    const { error } = await admin.from(table).delete().neq('id', nil)
    if (error) throw error
  }
  const { data: files } = await admin.storage.from('recipe-photos').list('', { limit: 1000 })
  for (const folder of files ?? []) {
    const { data: inner } = await admin.storage.from('recipe-photos').list(folder.name, { limit: 1000 })
    const paths = (inner ?? []).map((f) => `${folder.name}/${f.name}`)
    if (paths.length > 0) await admin.storage.from('recipe-photos').remove(paths)
  }
}

export const PNG_1PX = new Blob(
  [Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0))],
  { type: 'image/png' },
)

export function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('Délai dépassé'))
      setTimeout(tick, 100)
    }
    tick()
  })
}

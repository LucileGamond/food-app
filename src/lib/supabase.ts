import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type AppSupabaseClient = SupabaseClient<Database>

export function createAppClient(url: string, anonKey: string, options?: { persistSession?: boolean }): AppSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: options?.persistSession ?? true, autoRefreshToken: true },
  })
}

let browserClient: AppSupabaseClient | null = null

/** Client unique de l'application (navigateur). */
export function getSupabase(): AppSupabaseClient {
  if (!browserClient) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (!url || !anonKey) {
      throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies (voir .env.example).')
    }
    browserClient = createAppClient(url, anonKey)
  }
  return browserClient
}

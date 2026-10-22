import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import type { Profile } from '@/lib/meals'

export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut'>

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn'
  userId: string | null
  profiles: Profile[]
  currentProfile: Profile | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ auth, children }: { auth: AuthClient; children: ReactNode }) {
  const api = useApi()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profiles, setProfiles] = useState<Profile[]>([])

  useEffect(() => {
    let active = true
    void auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [auth])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
      setProfiles([])
      return
    }
    let active = true
    api.meals.listProfiles().then(
      (list) => active && setProfiles(list),
      () => active && setProfiles([]),
    )
    return () => {
      active = false
    }
  }, [api, userId])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password })
        if (!error) return null
        if (error.status === 400 || /invalid/i.test(error.message)) return 'E-mail ou mot de passe incorrect.'
        return 'Connexion impossible pour le moment. Réessaie.'
      } catch (error) {
        return errorMessage(error) === 'Une erreur est survenue.' ? 'Connexion impossible. Vérifie ta connexion internet.' : errorMessage(error)
      }
    },
    [auth],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
  }, [auth])

  const value = useMemo<AuthState>(
    () => ({
      status: session === undefined ? 'loading' : session ? 'signedIn' : 'signedOut',
      userId,
      profiles,
      currentProfile: profiles.find((p) => p.id === userId) ?? null,
      signIn,
      signOut,
    }),
    [session, userId, profiles, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth doit être utilisé dans un AuthProvider')
  return value
}

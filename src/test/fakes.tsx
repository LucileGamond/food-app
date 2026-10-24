import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { vi } from 'vitest'
import type { Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider, type AuthClient } from '@/auth/AuthProvider'
import type { Meal, Profile, RecipeSummary } from '@/lib/meals'
import type { Recipe } from '@/lib/recipes'
import type { WeightEntry } from '@/lib/weights'

export const LUCILE: Profile = { id: 'u-lucile', display_name: 'Lucile' }
export const ERIC: Profile = { id: 'u-eric', display_name: 'Eric' }
export const PROFILES = [ERIC, LUCILE]

type Mocked<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? ReturnType<typeof vi.fn<(...args: A) => R>> : T[K] }
export type FakeApi = { [K in keyof Api]: Mocked<Api[K]> }

/** Api entièrement simulée : chaque méthode est un vi.fn() avec une réponse par défaut. */
export function fakeApi(): FakeApi {
  return {
    meals: {
      listProfiles: vi.fn(async () => PROFILES),
      listMeals: vi.fn(async () => [] as Meal[]),
      createMeal: vi.fn(async () => 'new-meal'),
      updateMeal: vi.fn(async () => undefined),
      moveMeal: vi.fn(async () => undefined),
      duplicateMeal: vi.fn(async () => 'dup-meal'),
      deleteMeal: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
    recipes: {
      listSavedRecipes: vi.fn(async () => []),
      listSavedSummaries: vi.fn(async () => [] as RecipeSummary[]),
      getRecipe: vi.fn(async () => null as Recipe | null),
      saveRecipe: vi.fn(async () => 'saved-recipe'),
      listUsages: vi.fn(async () => []),
      deleteRecipe: vi.fn(async () => undefined),
      listTags: vi.fn(async () => [] as string[]),
    },
    photos: {
      uploadPhoto: vi.fn(async () => ({ id: 'p-new', storage_path: 'r/p-new.jpg', position: 0 })),
      deletePhoto: vi.fn(async () => undefined),
      reorderPhotos: vi.fn(async () => undefined),
      signedUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}`]))),
    },
    weights: {
      listEntries: vi.fn(async () => [] as WeightEntry[]),
      saveWeighIn: vi.fn(async () => undefined),
      deleteWeighIn: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
  }
}

export function fakeAuth(options: { signedIn?: boolean; userId?: string } = {}) {
  const userId = options.userId ?? LUCILE.id
  let session: unknown = options.signedIn === false ? null : { user: { id: userId } }
  const listeners = new Set<(event: string, session: unknown) => void>()
  const emit = () => listeners.forEach((l) => l('SIGNED_IN', session))
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    }),
    signInWithPassword: vi.fn(async ({ password }: { email: string; password: string }) => {
      if (password !== 'bon-mot-de-passe') return { data: {}, error: { status: 400, message: 'Invalid login credentials' } }
      session = { user: { id: userId } }
      emit()
      return { data: {}, error: null }
    }),
    signOut: vi.fn(async () => {
      session = null
      emit()
      return { error: null }
    }),
  }
  return auth as typeof auth & AuthClient
}

export function mealFixture(overrides: Omit<Partial<Meal>, 'recipe'> & { recipe?: Partial<RecipeSummary> } = {}): Meal {
  const { recipe, ...rest } = overrides
  return {
    id: 'm1',
    meal_date: '2026-10-20',
    slot: 'LUNCH',
    people: [LUCILE.id],
    ...rest,
    recipe: { id: 'r1', is_saved: false, title: 'Pâtes tomate', notes: null, url: null, tags: [], ...recipe },
  }
}

interface Options extends Omit<RenderOptions, 'wrapper'> {
  api?: FakeApi
  auth?: ReturnType<typeof fakeAuth>
  route?: string
  path?: string
  extraRoutes?: ReactNode
}

/** Rend un écran avec l'api simulée, l'auth et le routeur. */
export function renderWithApp(ui: ReactElement, { api = fakeApi(), auth = fakeAuth(), route = '/', path = '/', extraRoutes, ...options }: Options = {}) {
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <ApiProvider api={api as unknown as Api}>
        <AuthProvider auth={auth}>
          <Routes>
            <Route path={path} element={ui} />
            {extraRoutes}
          </Routes>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
    options,
  )
  return { ...result, api, auth }
}

import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { vi } from 'vitest'
import type { Api } from '@/api'
import type { RecipeUsages } from '@/api/recipes'
import type { MealIdea } from '@/lib/mealIdeas'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider, type AuthClient } from '@/auth/AuthProvider'
import type { Meal, Profile, RecipeSummary } from '@/lib/meals'
import type { Ingredient, Recipe, RecipeHistory, RecipeImport, RecipeListItem } from '@/lib/recipes'
import type { Consumption, FoodPeriod, PeriodItem, PlanItem } from '@/lib/food'
import type { InboxItem } from '@/lib/inbox'
import type { ShoppingItem, ShoppingItemInput, ShoppingList } from '@/lib/shopping'
import type { TidyLine } from '@/lib/shoppingFromPlan'
import type { WeightEntry } from '@/lib/weights'

export const LUCILE: Profile = { id: 'u-lucile', display_name: 'Lucile' }
export const ERIC: Profile = { id: 'u-eric', display_name: 'Eric' }
export const PROFILES = [ERIC, LUCILE]

/** Recette de la liste : valeurs neutres, à compléter. */
export function listItem(item: Pick<RecipeListItem, 'id' | 'title'> & Partial<RecipeListItem>): RecipeListItem {
  return {
    tags: [],
    ingredientNames: [],
    mainPhotoPath: null,
    createdAt: '2026-10-01T10:00:00Z',
    source: null,
    sourcePage: null,
    totalMinutes: null,
    kcal: null,
    nutritionPer: null,
    vegetarian: false,
    timesCooked: 0,
    lastCooked: null,
    nextPlanned: null,
    rating: null,
    ...item,
  }
}

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
      getHistory: vi.fn(async (): Promise<RecipeHistory> => ({ timesCooked: 0, lastCooked: null, nextPlanned: null })),
      saveReview: vi.fn(async () => undefined),
      getRecipe: vi.fn(async () => null as Recipe | null),
      saveRecipe: vi.fn(async () => 'saved-recipe'),
      listUsages: vi.fn(async () => ({ meals: [], recipes: [] }) as RecipeUsages),
      deleteRecipe: vi.fn(async () => undefined),
      listTags: vi.fn(async () => [] as string[]),
      listSources: vi.fn(async () => [] as string[]),
      findSavedByUrl: vi.fn(async () => null as { id: string; title: string } | null),
      useSavedRecipe: vi.fn(async () => 1),
      linkIngredient: vi.fn(async () => undefined),
      getIngredients: vi.fn(async () => [] as { id: string; servings: number | null; ingredients: Ingredient[] }[]),
      importFromPhotos: vi.fn(async (): Promise<RecipeImport> => ({ recipe: { title: 'Recette lue', servings: null, ingredients: [], steps: '', tags: [] }, source: 'photo', image: null })),
      importFromUrl: vi.fn(async (): Promise<RecipeImport> => ({ recipe: { title: 'Recette importée', servings: null, ingredients: [], steps: '', tags: [] }, source: 'structured', image: null })),
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
    ideas: {
      suggestMeals: vi.fn(async () => [] as MealIdea[]),
    },
    inbox: {
      listItems: vi.fn(async () => [] as InboxItem[]),
      addItem: vi.fn(async () => 'new-item'),
      renameItem: vi.fn(async () => undefined),
      deleteItem: vi.fn(async () => undefined),
      planItem: vi.fn(async () => 'planned-meal'),
      fetchTitle: vi.fn(async () => null as string | null),
      subscribe: vi.fn(() => () => undefined),
    },
    shopping: {
      listLists: vi.fn(async () => [] as ShoppingList[]),
      getList: vi.fn(async (id: string) => ({ id, name: 'Courses' }) as { id: string; name: string } | null),
      createList: vi.fn(async () => 'new-list'),
      renameList: vi.fn(async () => undefined),
      deleteList: vi.fn(async () => undefined),
      listItems: vi.fn(async () => [] as ShoppingItem[]),
      addItem: vi.fn(
        async (listId: string, input: ShoppingItemInput, position: number): Promise<ShoppingItem> => ({
          id: `item-${Math.random()}`,
          list_id: listId,
          checked: false,
          position,
          ...input,
        }),
      ),
      addItems: vi.fn(async () => undefined),
      tidy: vi.fn(async () => [] as TidyLine[]),
      updateItem: vi.fn(async () => undefined),
      deleteItem: vi.fn(async () => undefined),
      clearChecked: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
    push: {
      saveSubscription: vi.fn(async () => undefined),
      isSubscribed: vi.fn(async () => false),
      deleteSubscription: vi.fn(async () => undefined),
    },
    food: {
      listPlan: vi.fn(async () => [] as PlanItem[]),
      savePlanItem: vi.fn(async () => undefined),
      deletePlanItem: vi.fn(async () => undefined),
      listPeriods: vi.fn(async () => [] as FoodPeriod[]),
      listPeriodItems: vi.fn(async () => [] as PeriodItem[]),
      createPeriod: vi.fn(async () => 'new-period'),
      deletePeriod: vi.fn(async () => undefined),
      addConsumption: vi.fn(async (_itemId: string, date: string): Promise<Consumption> => ({ id: `c-${Math.random()}`, consumed_on: date, created_at: new Date().toISOString() })),
      removeConsumption: vi.fn(async () => undefined),
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

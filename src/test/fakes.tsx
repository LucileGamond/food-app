import { TEST_GLOSSARY } from './knitGlossary'
import type { MeasureProfile } from '@/modules/tricot/lib/sizing'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { vi } from 'vitest'
import type { Api } from '@/api'
import type { RecipeUsages } from '@/api/recipes'
import type { LinkableRecipe } from '@/lib/autoLinks'
import type { SavedProgress } from '@/lib/cooking'
import type { MealIdea } from '@/lib/mealIdeas'
import { ApiProvider } from '@/app/ApiContext'
import { SettingsProvider } from '@/app/SettingsContext'
import { AuthProvider, type AuthClient } from '@/auth/AuthProvider'
import type { Meal, Profile, RecipeSummary } from '@/lib/meals'
import type { Ingredient, Recipe, RecipeHistory, RecipeImport, RecipeListItem } from '@/lib/recipes'
import type { Consumption, FoodPeriod, PeriodItem, PlanItem } from '@/lib/food'
import type { NutritionEstimate } from '@/lib/nutritionEstimate'
import type { InboxItem } from '@/lib/inbox'
import type { ShoppingItem, ShoppingItemInput, ShoppingList } from '@/lib/shopping'
import type { TidyLine } from '@/lib/shoppingFromPlan'
import type { WeightEntry } from '@/lib/weights'
import type { WaterIntake } from '@/lib/hydration'
import type { ActivityEvent } from '@/lib/activity'
import type { WaterInput } from '@/modules/plantes/api'
import type { Plant, PlantPhoto, WateringEvent } from '@/modules/plantes/lib/plants'
import type { KnitProject, KnitProjectSummary, ReadPattern } from '@/modules/tricot/lib/pattern'
import type { ProjectProgress } from '@/modules/tricot/lib/progress'
import type { AdaptedStep } from '@/modules/tricot/lib/adapt'
import { EMPTY_YARN, type StashItem, type Yarn, type YarnIdea } from '@/modules/tricot/lib/yarn'
import type { KnitPattern } from '@/modules/tricot/lib/library'
import { DEFAULT_SETTINGS, type UserSettings } from '@/lib/settings'
import type { AgendaEvent, CalendarSource } from '@/modules/agenda/lib/agenda'
import { DEFAULT_RULE, type PresenceRule } from '@/modules/repas/lib/presence'
import type { Dish } from '@/modules/repas/lib/weekPlan'
import type { UsageRow } from '@/lib/llmUsage'
import type { BudgetStatus, CreditStatus } from '@/lib/llmBudget'
import type { LlmCredit, RealCost } from '@/api/llmUsage'

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
    url: null,
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
      setCook: vi.fn(async () => undefined),
      deleteMeal: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
    recipes: {
      listSavedRecipes: vi.fn(async () => []),
      listSavedSummaries: vi.fn(async () => [] as RecipeSummary[]),
      getHistory: vi.fn(async (): Promise<RecipeHistory> => ({ timesCooked: 0, lastCooked: null, nextPlanned: null })),
      saveReview: vi.fn(async () => undefined),
      listLinkable: vi.fn(async () => [] as LinkableRecipe[]),
      getProgress: vi.fn(async () => null as SavedProgress | null),
      saveProgress: vi.fn(async () => undefined),
      getRecipe: vi.fn(async () => null as Recipe | null),
      saveRecipe: vi.fn(async () => 'saved-recipe'),
      listUsages: vi.fn(async () => ({ meals: [], recipes: [] }) as RecipeUsages),
      deleteRecipe: vi.fn(async () => undefined),
      listTags: vi.fn(async () => [] as string[]),
      listSources: vi.fn(async () => [] as string[]),
      findSavedByUrl: vi.fn(async () => null as { id: string; title: string } | null),
      replaceAdhocWithSaved: vi.fn(async () => 1),
      linkIngredient: vi.fn(async () => undefined),
      getIngredients: vi.fn(async () => [] as { id: string; servings: number | null; ingredients: Ingredient[] }[]),
      importFromPhotos: vi.fn(async (): Promise<RecipeImport> => ({ recipe: { title: 'Recette lue', servings: null, ingredients: [], steps: '', tags: [] }, source: 'photo', image: null })),
      detectPhotoRotation: vi.fn(async (_candidates: Blob[]) => 0),
      estimateNutrition: vi.fn(async (): Promise<NutritionEstimate> => ({ per: 'portion', kcal: 0, protein: 0, carbs: 0, fat: 0, ingredients: [] })),
      saveNutrition: vi.fn(async () => undefined),
      importFromText: vi.fn(async (): Promise<RecipeImport> => ({ recipe: { title: 'Recette de la légende', servings: null, ingredients: [], steps: '', tags: [] }, source: 'text', image: null })),
      importFromUrl: vi.fn(async (): Promise<RecipeImport> => ({ recipe: { title: 'Recette importée', servings: null, ingredients: [], steps: '', tags: [] }, source: 'structured', image: null })),
    },
    photos: {
      uploadPhoto: vi.fn(async () => ({ id: 'p-new', storage_path: 'r/p-new.jpg', position: 0 })),
      deletePhoto: vi.fn(async () => undefined),
      reorderPhotos: vi.fn(async () => undefined),
      signedUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}`]))),
      listAllPhotos: vi.fn(async () => [] as { id: string; storage_path: string; recipe_id: string }[]),
      replacePhoto: vi.fn(async (photo: { id: string; storage_path: string }) => ({ id: photo.id, storage_path: `${photo.storage_path}.droite`, position: 0 })),
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
      uploadPhotos: vi.fn(async (photos: Blob[]) => photos.map((_, i) => `pending/photo-${i + 1}.jpg`)),
      downloadPhotos: vi.fn(async (paths: string[]) => paths.map((p) => new File([p], p.split('/').pop()!, { type: 'image/jpeg' }))),
      removePhotos: vi.fn(async () => undefined),
      moveItem: vi.fn(async () => undefined),
      resolveItem: vi.fn(async () => undefined),
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
    settings: {
      getSettings: vi.fn(async (): Promise<UserSettings> => DEFAULT_SETTINGS),
      saveSettings: vi.fn(async () => undefined),
    },
    hydration: {
      listIntakes: vi.fn(async () => [] as WaterIntake[]),
      addIntake: vi.fn(async (volumeMl: number): Promise<WaterIntake> => ({ id: `w-${Math.random()}`, volume_ml: volumeMl, drunk_at: new Date().toISOString() })),
      deleteIntake: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
    knitting: {
      getGlossary: vi.fn(async () => TEST_GLOSSARY),
      listMeasures: vi.fn(async (): Promise<MeasureProfile[]> => []),
      saveMeasures: vi.fn(async () => undefined),
      deleteMeasures: vi.fn(async () => undefined),
      listProjects: vi.fn(async () => [] as KnitProjectSummary[]),
      getProject: vi.fn(async () => null as KnitProject | null),
      readPattern: vi.fn(async (): Promise<ReadPattern> => ({ title: 'Patron lu', sizes: [], steps: [] })),
      createProject: vi.fn(async () => 'new-project'),
      saveProgress: vi.fn(async () => undefined),
      mergeSteps: vi.fn(async () => undefined),
      saveSections: vi.fn(async () => undefined),
      splitStep: vi.fn(async () => undefined),
      saveNeedles: vi.fn(async () => undefined),
      saveGauges: vi.fn(async () => undefined),
      deleteProject: vi.fn(async () => undefined),
      pdfUrl: vi.fn(async (path: string) => `https://cdn.test/${path}`),
      saveProjectInfo: vi.fn(async () => undefined),
      readYarnLabel: vi.fn(async (): Promise<Yarn> => ({ ...EMPTY_YARN, brand: 'Phildar' })),
      listPatterns: vi.fn(async () => [] as KnitPattern[]),
      getPattern: vi.fn(async () => null as KnitPattern | null),
      savePattern: vi.fn(async () => 'new-pattern'),
      deletePattern: vi.fn(async () => undefined),
      getProgress: vi.fn(async (): Promise<ProjectProgress> => ({ notes: '', photos: [] })),
      saveProjectNotes: vi.fn(async () => undefined),
      addProgressPhoto: vi.fn(async () => undefined),
      saveCaption: vi.fn(async () => undefined),
      deleteProgressPhoto: vi.fn(async () => undefined),
      progressPhotoUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}`]))),
      listStash: vi.fn(async () => [] as StashItem[]),
      saveStashItem: vi.fn(async () => undefined),
      deleteStashItem: vi.fn(async () => undefined),
      yarnIdeas: vi.fn(async () => [] as YarnIdea[]),
      downloadPdf: vi.fn(async (_path: string, name: string) => new File(['%PDF'], `${name}.pdf`, { type: 'application/pdf' })),
      addChart: vi.fn(async () => undefined),
      askAboutStep: vi.fn(async () => 'Réponse du modèle.'),
      translateText: vi.fn(async (text: string) => ({ text: `Traduit : ${text}`, numbersKept: true })),
      saveYarnChecks: vi.fn(async () => undefined),
      adaptPattern: vi.fn(async (): Promise<AdaptedStep[]> => []),
      saveAdaptation: vi.fn(async () => undefined),
      setSizeIndex: vi.fn(async () => undefined),
      updateChart: vi.fn(async () => undefined),
      deleteChart: vi.fn(async () => undefined),
    },
    plants: {
      listPlants: vi.fn(async () => [] as Plant[]),
      getPlant: vi.fn(async () => null as Plant | null),
      savePlant: vi.fn(async () => 'new-plant'),
      setArchived: vi.fn(async () => undefined),
      deletePlant: vi.fn(async () => undefined),
      listEvents: vi.fn(async () => [] as WateringEvent[]),
      water: vi.fn(async (input: WaterInput): Promise<WateringEvent> => ({
        id: `w-${Math.random()}`,
        plant_id: input.plantId,
        rule_id: input.ruleId,
        scheduled_on: input.scheduledOn,
        watered_at: new Date().toISOString(),
        amount_ml: input.amountMl,
        done_by: 'u-lucile',
        note: null,
      })),
      undoWatering: vi.fn(async () => undefined),
      uploadPhoto: vi.fn(async (_plantId: string, _file: Blob): Promise<PlantPhoto> => ({ id: `p-${Math.random()}`, storage_path: 'plant-1/photo.jpg', position: 0 })),
      deletePhoto: vi.fn(async () => undefined),
      reorderPhotos: vi.fn(async () => undefined),
      signedUrls: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://cdn.test/${p}`]))),
      subscribe: vi.fn(() => () => undefined),
    },
    agenda: {
      listSources: vi.fn(async () => [] as CalendarSource[]),
      addIcalSource: vi.fn(async () => 'new-source'),
      deleteSource: vi.fn(async () => undefined),
      listEvents: vi.fn(async () => [] as AgendaEvent[]),
      syncNow: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    },
    llmUsage: {
      summary: vi.fn(async () => [] as UsageRow[]),
      budgetStatus: vi.fn(async (): Promise<BudgetStatus> => ({ monthlyEur: null, spentUsd: 0 })),
      setBudget: vi.fn(async () => undefined),
      creditStatus: vi.fn(async (): Promise<CreditStatus> => ({ creditsUsd: 0, since: null, spentUsd: 0 })),
      listCredits: vi.fn(async () => [] as LlmCredit[]),
      addCredit: vi.fn(async () => undefined),
      deleteCredit: vi.fn(async () => undefined),
      realCost: vi.fn(async (): Promise<RealCost> => ({ available: false })),
    },
    activity: {
      listRecent: vi.fn(async () => [] as ActivityEvent[]),
      subscribe: vi.fn(() => () => undefined),
    },
    weekPlan: {
      listRules: vi.fn(async () => [] as PresenceRule[]),
      getMyRule: vi.fn(async () => DEFAULT_RULE),
      saveMyRule: vi.fn(async () => undefined),
      listDishes: vi.fn(async (items: InboxItem[]) =>
        items.map((i): Dish => ({ id: i.id, title: i.title, recipeId: i.recipe_id, minutes: null, servings: null, ingredients: [] })),
      ),
      proposePlan: vi.fn(async (): Promise<unknown> => ({ meals: [] })),
      saveWeek: vi.fn(async () => 0),
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
          <SettingsProvider>
            <Routes>
              <Route path={path} element={ui} />
              {extraRoutes}
            </Routes>
          </SettingsProvider>
          <Toaster />
        </AuthProvider>
      </ApiProvider>
    </MemoryRouter>,
    options,
  )
  return { ...result, api, auth }
}

import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider, type AuthClient } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { Layout } from '@/components/Layout'
import { PageGuard, SettingsRoute } from '@/components/PageGuard'
import { LoginPage } from '@/pages/LoginPage'
import { PlanningPage } from '@/pages/PlanningPage'

// Les écrans Recettes sont chargés à la demande pour alléger le premier affichage.
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then((m) => ({ default: m.RecipesPage })))
const SeasonPage = lazy(() => import('@/pages/SeasonPage').then((m) => ({ default: m.SeasonPage })))
const BookScanPage = lazy(() => import('@/pages/BookScanPage').then((m) => ({ default: m.BookScanPage })))
const RecipeBatchImportPage = lazy(() => import('@/pages/RecipeBatchImportPage').then((m) => ({ default: m.RecipeBatchImportPage })))
const CookingPage = lazy(() => import('@/pages/CookingPage').then((m) => ({ default: m.CookingPage })))
const RecipePrintPage = lazy(() => import('@/pages/RecipePrintPage').then((m) => ({ default: m.RecipePrintPage })))
const RecipeDetailPage = lazy(() => import('@/pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage })))
const WeightPage = lazy(() => import('@/pages/WeightPage').then((m) => ({ default: m.WeightPage })))
const FoodTrackingPage = lazy(() => import('@/pages/FoodTrackingPage').then((m) => ({ default: m.FoodTrackingPage })))
const FoodPlanPage = lazy(() => import('@/pages/FoodPlanPage').then((m) => ({ default: m.FoodPlanPage })))
const SharePage = lazy(() => import('@/pages/SharePage').then((m) => ({ default: m.SharePage })))
const ShoppingListsPage = lazy(() => import('@/pages/ShoppingListsPage').then((m) => ({ default: m.ShoppingListsPage })))
const ShoppingListPage = lazy(() => import('@/pages/ShoppingListPage').then((m) => ({ default: m.ShoppingListPage })))
const HydrationPage = lazy(() => import('@/pages/HydrationPage').then((m) => ({ default: m.HydrationPage })))
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
// Module Tricot (indépendant de la cuisine).
const KnittingPage = lazy(() => import('@/modules/tricot/pages/KnittingPage').then((m) => ({ default: m.KnittingPage })))
const KnittingImportPage = lazy(() => import('@/modules/tricot/pages/KnittingImportPage').then((m) => ({ default: m.KnittingImportPage })))
const KnittingQueueFormPage = lazy(() => import('@/modules/tricot/pages/KnittingQueueFormPage').then((m) => ({ default: m.KnittingQueueFormPage })))
const KnittingProjectPage = lazy(() => import('@/modules/tricot/pages/KnittingProjectPage').then((m) => ({ default: m.KnittingProjectPage })))
// Module Plantes (indépendant de la cuisine, partagé par le foyer).
const PlantsPage = lazy(() => import('@/modules/plantes/pages/PlantsPage').then((m) => ({ default: m.PlantsPage })))
const PlantFormPage = lazy(() => import('@/modules/plantes/pages/PlantFormPage').then((m) => ({ default: m.PlantFormPage })))
const PlantDetailPage = lazy(() => import('@/modules/plantes/pages/PlantDetailPage').then((m) => ({ default: m.PlantDetailPage })))
const AgendaPage = lazy(() => import('@/modules/agenda/pages/AgendaPage').then((m) => ({ default: m.AgendaPage })))
const AgendaSourcesPage = lazy(() => import('@/modules/agenda/pages/AgendaSourcesPage').then((m) => ({ default: m.AgendaSourcesPage })))
const RecipeFormPage = lazy(() => import('@/pages/RecipeFormPage').then((m) => ({ default: m.RecipeFormPage })))

export function App({ api, auth }: { api: Api; auth: AuthClient }) {
  return (
    <ApiProvider api={api}>
      <AuthProvider auth={auth}>
        <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<SettingsRoute />}>
              {/* Mode cuisine : plein écran, sans la navigation. */}
              <Route
                path="/recettes/:id/cuisiner"
                element={
                  <PageGuard page="recettes">
                    <CookingPage />
                  </PageGuard>
                }
              />
              {/* Fiche à imprimer ou à enregistrer en PDF. */}
              <Route
                path="/recettes/:id/imprimer"
                element={
                  <PageGuard page="recettes">
                    <RecipePrintPage />
                  </PageGuard>
                }
              />
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/planning" element={<PlanningPage />} />
                <Route path="/recettes" element={<RecipesPage />} />
                <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
                <Route path="/recettes/import-serie" element={<RecipeBatchImportPage />} />
                <Route path="/recettes/scanner" element={<BookScanPage />} />
                <Route path="/recettes/saison" element={<SeasonPage />} />
                <Route path="/recettes/:id" element={<RecipeDetailPage />} />
                <Route path="/recettes/:id/modifier" element={<RecipeFormPage />} />
                <Route path="/partage" element={<SharePage />} />
                <Route path="/plan" element={<FoodTrackingPage />} />
                <Route path="/plan/modifier" element={<FoodPlanPage />} />
                <Route path="/poids" element={<WeightPage />} />
                <Route path="/courses" element={<ShoppingListsPage />} />
                <Route path="/courses/:id" element={<ShoppingListPage />} />
                <Route path="/hydratation" element={<HydrationPage />} />
                <Route path="/reglages" element={<SettingsPage />} />
                <Route path="/tricot" element={<KnittingPage />} />
                <Route path="/tricot/nouveau" element={<KnittingImportPage />} />
                <Route path="/tricot/a-faire" element={<KnittingQueueFormPage />} />
                <Route path="/tricot/:id" element={<KnittingProjectPage />} />
                <Route path="/plantes" element={<PlantsPage />} />
                <Route path="/plantes/nouvelle" element={<PlantFormPage />} />
                <Route path="/plantes/:id" element={<PlantDetailPage />} />
                <Route path="/plantes/:id/modifier" element={<PlantFormPage />} />
                <Route path="/agenda" element={<AgendaPage />} />
                <Route path="/agenda/sources" element={<AgendaSourcesPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <Toaster position="top-center" closeButton toastOptions={{ className: 'font-sans' }} />
      </AuthProvider>
    </ApiProvider>
  )
}

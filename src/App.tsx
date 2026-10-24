import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import type { Api } from '@/api'
import { ApiProvider } from '@/app/ApiContext'
import { AuthProvider, type AuthClient } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { PlanningPage } from '@/pages/PlanningPage'

// Les écrans Recettes sont chargés à la demande pour alléger le premier affichage.
const RecipesPage = lazy(() => import('@/pages/RecipesPage').then((m) => ({ default: m.RecipesPage })))
const RecipeDetailPage = lazy(() => import('@/pages/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage })))
const WeightPage = lazy(() => import('@/pages/WeightPage').then((m) => ({ default: m.WeightPage })))
const RecipeFormPage = lazy(() => import('@/pages/RecipeFormPage').then((m) => ({ default: m.RecipeFormPage })))

export function App({ api, auth }: { api: Api; auth: AuthClient }) {
  return (
    <ApiProvider api={api}>
      <AuthProvider auth={auth}>
        <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/recettes" element={<RecipesPage />} />
              <Route path="/recettes/nouvelle" element={<RecipeFormPage />} />
              <Route path="/recettes/:id" element={<RecipeDetailPage />} />
              <Route path="/recettes/:id/modifier" element={<RecipeFormPage />} />
              <Route path="/poids" element={<WeightPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/planning" replace />} />
        </Routes>
        </Suspense>
        <Toaster position="top-center" closeButton toastOptions={{ className: 'font-sans' }} />
      </AuthProvider>
    </ApiProvider>
  )
}

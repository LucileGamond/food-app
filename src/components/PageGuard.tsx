import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { toast } from 'sonner'
import { SettingsProvider, useSettings } from '@/app/SettingsContext'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { HOME_PATH, PAGES, type PageKey } from '@/lib/settings'

/** Réglages chargés une fois pour tous les écrans connectés (navigation, mode cuisine, impression…). */
export function SettingsRoute() {
  return (
    <SettingsProvider>
      <Outlet />
    </SettingsProvider>
  )
}

/** Page masquée dans les réglages : retour à l'accueil, en le disant. */
export function HiddenPageRedirect({ page }: { page: PageKey }) {
  const label = PAGES.find((p) => p.key === page)!.label
  useEffect(() => {
    toast.info(`« ${label} » est masquée dans tes réglages`, { id: 'page-masquee' })
  }, [label])
  return <Navigate to={HOME_PATH} replace />
}

/** Écran d'une page (hors navigation, ex. mode cuisine) : seulement si la page est affichée. */
export function PageGuard({ page, children }: { page: PageKey; children: ReactNode }) {
  const { loading, isEnabled } = useSettings()
  if (loading) return <FullPageSpinner />
  return isEnabled(page) ? children : <HiddenPageRedirect page={page} />
}

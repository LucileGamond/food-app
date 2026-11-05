import { BookOpen, CalendarDays, GlassWater, ListChecks, LogOut, MoreHorizontal, Scale, Settings, ShoppingCart, Spool, Sprout, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BuildInfo } from '@/components/BuildInfo'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSettings } from '@/app/SettingsContext'
import { HiddenPageRedirect } from '@/components/PageGuard'
import { useAuth } from '@/auth/AuthProvider'
import { NotificationsButton, NotificationsPrompt } from '@/components/Notifications'
import { pageOf, PAGES, type PageKey } from '@/lib/settings'
import { cn } from '@/lib/utils'

const MAX_TABS = 5

const ICONS: Record<PageKey, LucideIcon> = {
  planning: CalendarDays,
  recettes: BookOpen,
  plan: ListChecks,
  courses: ShoppingCart,
  poids: Scale,
  hydratation: GlassWater,
  tricot: Spool,
  plantes: Sprout,
}

function Brand() {
  return (
    <div className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
        <UtensilsCrossed className="size-4" aria-hidden />
      </span>
      Food
    </div>
  )
}

export function Layout() {
  const { currentProfile, signOut } = useAuth()
  const { loading, isEnabled, notifications } = useSettings()
  const { pathname } = useLocation()
  // Pages choisies dans les réglages (chacun les siennes) ; rien pendant le chargement (pas d'onglets qui clignotent),
  // toutes si les réglages n'ont pas pu être lus.
  const nav = loading ? [] : PAGES.filter((p) => isEnabled(p.key)).map((p) => ({ ...p, icon: ICONS[p.key] }))
  const page = pageOf(pathname)
  // Téléphone : au-delà de 5 pages, les dernières passent dans « Plus ».
  const tabs = nav.length > MAX_TABS ? nav.slice(0, MAX_TABS - 1) : nav
  const more = nav.slice(tabs.length)
  if (page && !isEnabled(page)) return <HiddenPageRedirect page={page} />

  async function logout() {
    // Avant la déconnexion (droits nécessaires) : l'appareil ne reçoit plus les notifications de ce compte.
    await notifications.forget()
    await signOut()
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-background px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isActive && 'bg-muted text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t px-2 pt-4">
          <span className="truncate text-sm text-muted-foreground">{currentProfile?.display_name}</span>
          <span className="flex-1" />
          <BuildInfo />
          <NotificationsButton notifications={notifications} />
          <SettingsLink />
          <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Se déconnecter">
            <LogOut />
          </Button>
        </div>
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <BuildInfo size="icon-lg" />
          <NotificationsButton notifications={notifications} size="icon-lg" />
          <SettingsLink size="icon-lg" />
          <Button variant="ghost" size="icon-lg" onClick={() => void logout()} aria-label="Se déconnecter">
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">
        <NotificationsPrompt notifications={notifications} />
        <Outlet />
      </main>

      {/* Onglets (mobile) : 5 au plus, les suivants dans « Plus ». */}
      <nav
        aria-label="Navigation principale"
        style={{ gridTemplateColumns: `repeat(${Math.max(tabs.length + (more.length ? 1 : 0), 1)}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground',
                isActive && 'text-foreground',
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground',
                    more.some((p) => p.key === page) && 'text-foreground',
                  )}
                />
              }
            >
              <MoreHorizontal className="size-5" aria-hidden />
              Plus
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-44">
              {more.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} render={<NavLink to={to} />}>
                  <Icon /> {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </div>
  )
}

function SettingsLink({ size = 'icon' }: { size?: 'icon' | 'icon-lg' }) {
  return (
    <Link to="/reglages" aria-label="Réglages" className={buttonVariants({ variant: 'ghost', size })}>
      <Settings />
    </Link>
  )
}

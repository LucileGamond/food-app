import { BookOpen, CalendarDays, ListChecks, LogOut, Scale, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/planning', label: 'Planning', icon: CalendarDays },
  { to: '/recettes', label: 'Recettes', icon: BookOpen },
  { to: '/plan', label: 'Plan', icon: ListChecks },
  { to: '/courses', label: 'Courses', icon: ShoppingCart },
  { to: '/poids', label: 'Poids', icon: Scale },
]

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

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-background px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
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
        <div className="mt-auto flex items-center justify-between gap-2 border-t px-2 pt-4">
          <span className="truncate text-sm text-muted-foreground">{currentProfile?.display_name}</span>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Se déconnecter">
            <LogOut />
          </Button>
        </div>
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <Brand />
        <Button variant="ghost" size="icon-lg" onClick={() => void signOut()} aria-label="Se déconnecter">
          <LogOut />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">
        <Outlet />
      </main>

      {/* Onglets (mobile) */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
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
      </nav>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

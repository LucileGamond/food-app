import { BookOpen, CalendarDays, GlassWater, HeartPulse, House, Leaf, ListChecks, LogOut, Scale, Settings, ShoppingCart, Spool, Sprout, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { useSettings } from '@/app/SettingsContext'
import { HiddenPageRedirect } from '@/components/PageGuard'
import { useAuth } from '@/auth/AuthProvider'
import { NotificationsPrompt } from '@/components/Notifications'
import { HOME_PATH, pageOf, sectionOf, visibleSections, type PageKey, type SectionKey } from '@/lib/settings'
import { cn } from '@/lib/utils'

const PAGE_ICONS: Record<PageKey, LucideIcon> = {
  planning: CalendarDays,
  recettes: BookOpen,
  courses: ShoppingCart,
  poids: Scale,
  plan: ListChecks,
  hydratation: GlassWater,
  tricot: Spool,
  plantes: Sprout,
}

const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  repas: UtensilsCrossed,
  sante: HeartPulse,
  tricot: Spool,
  plantes: Sprout,
}

function Brand() {
  return (
    // Raccourci vers l'accueil « Aujourd’hui ».
    <Link to={HOME_PATH} aria-label="Life, accueil" className="flex items-center gap-2 rounded-lg font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
        <Leaf className="size-4" aria-hidden />
      </span>
      Life
    </Link>
  )
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-muted text-foreground',
  )

const tabClass = (active: boolean) => cn('flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground', active && 'text-foreground')

/**
 * Navigation par sections (Repas, Santé, Tricot, Plantes) et accueil « Aujourd’hui ». Ordinateur : barre latérale avec
 * les pages de chaque section. Téléphone : une section par onglet, et ses pages en haut de l'écran.
 */
export function Layout() {
  const { currentProfile, signOut } = useAuth()
  const { loading, isEnabled, notifications } = useSettings()
  const { pathname } = useLocation()
  // Pages choisies dans les réglages (chacun les siennes) ; rien pendant le chargement (pas d'onglets qui clignotent),
  // toutes si les réglages n'ont pas pu être lus.
  const sections = loading ? [] : visibleSections(isEnabled)
  const page = pageOf(pathname)
  const current = page ? sections.find(({ section }) => section.key === sectionOf(page).key) : undefined
  // Dernière page ouverte de chaque section : l'onglet de la section y ramène (Eau plutôt que Poids).
  const [lastPages, setLastPages] = useState<Partial<Record<SectionKey, PageKey>>>({})
  if (page && current && lastPages[current.section.key] !== page) setLastPages({ ...lastPages, [current.section.key]: page })
  if (page && !isEnabled(page)) return <HiddenPageRedirect page={page} />

  async function logout() {
    // Avant la déconnexion (droits nécessaires) : l'appareil ne reçoit plus les notifications de ce compte.
    await notifications.forget()
    await signOut()
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r bg-background px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-4">
          <NavLink to={HOME_PATH} end className={sideLink}>
            <House className="size-4" aria-hidden />
            Aujourd’hui
          </NavLink>
          {sections.map(({ section, pages }) => {
            // Section d'une seule page du même nom (Tricot, Plantes) : un lien, sans titre de section.
            if (pages.length === 1 && pages[0]!.label === section.label) {
              const Icon = SECTION_ICONS[section.key]
              return (
                <NavLink key={section.key} to={pages[0]!.to} className={sideLink}>
                  <Icon className="size-4" aria-hidden />
                  {section.label}
                </NavLink>
              )
            }
            return (
              <div key={section.key} role="group" aria-labelledby={`section-${section.key}`} className="flex flex-col gap-1">
                <p id={`section-${section.key}`} className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {section.label}
                </p>
                {pages.map(({ key, to, label }) => {
                  const Icon = PAGE_ICONS[key]
                  return (
                    <NavLink key={key} to={to} className={sideLink}>
                      <Icon className="size-4" aria-hidden />
                      {label}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t px-2 pt-4">
          <span className="truncate text-sm text-muted-foreground">{currentProfile?.display_name}</span>
          <span className="flex-1" />
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
          <SettingsLink size="icon-lg" />
          <Button variant="ghost" size="icon-lg" onClick={() => void logout()} aria-label="Se déconnecter">
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">
        {/* Pages de la section (téléphone) : sur ordinateur, elles sont dans la barre latérale. */}
        {current && current.pages.length > 1 && (
          <nav aria-label={`Pages de la section ${current.section.label}`} className="-mt-2 mb-5 md:hidden">
            <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${current.pages.length}, minmax(0, 1fr))` }}>
              {current.pages.map(({ key, to, label }) => (
                <NavLink
                  key={key}
                  to={to}
                  className={({ isActive }) =>
                    cn('flex h-9 items-center justify-center rounded-lg text-sm font-medium text-muted-foreground', isActive && 'bg-background text-foreground shadow-xs')
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
        <NotificationsPrompt notifications={notifications} />
        <Outlet />
      </main>

      {/* Onglets (mobile) : l'accueil, puis une section par onglet (la dernière page ouverte de la section, sinon la première). */}
      <nav
        aria-label="Navigation principale"
        style={{ gridTemplateColumns: `repeat(${sections.length + 1}, minmax(0, 1fr))` }}
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <NavLink to={HOME_PATH} end className={({ isActive }) => tabClass(isActive)}>
          <House className="size-5" aria-hidden />
          Accueil
        </NavLink>
        {sections.map(({ section, pages }) => {
          const Icon = SECTION_ICONS[section.key]
          const active = current?.section.key === section.key
          const target = pages.find((p) => p.key === lastPages[section.key]) ?? pages[0]!
          return (
            <Link key={section.key} to={target.to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
              <Icon className="size-5" aria-hidden />
              {section.label}
            </Link>
          )
        })}
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

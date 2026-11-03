import { Archive, CalendarPlus, ChevronDown, ExternalLink, Images, Link2, MoreHorizontal, ScanText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useApi } from '@/app/ApiContext'
import { useInbox } from '@/hooks/useInbox'
import { RemoveInboxItemDialog } from '@/components/planning/InboxDialogs'
import { inboxKind, inboxSubtitle, type InboxItem } from '@/lib/inbox'
import { cn } from '@/lib/utils'
import type { NavState } from '@/lib/navState'
import { useSettings } from '@/app/SettingsContext'

/**
 * Recettes mises de côté (liens, photos), pas encore analysées : à préremplir puis enregistrer, à passer dans
 * « À planifier », ou à supprimer. Rien ne s'affiche tant que la liste est vide.
 */
export function SetAsideList() {
  const planning = useSettings().isEnabled('planning')
  const api = useApi()
  const navigate = useNavigate()
  const aside = useInbox(api, 'aside')
  const [open, setOpen] = useState(true)
  const [removing, setRemoving] = useState<InboxItem | null>(null)
  const count = aside.items.length

  if (aside.loading || (count === 0 && !aside.loadError)) return null

  return (
    <section aria-labelledby="aside-heading" className="mb-6 rounded-2xl border bg-background shadow-xs">
      <h2 id="aside-heading">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 w-full items-center gap-2 rounded-2xl px-4 py-3 text-left font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Archive className="size-4 text-brand" aria-hidden />
          <span className="flex-1">De côté</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{count}</span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden />
        </button>
      </h2>
      {open && (
        <div className="border-t px-3 py-3">
          {aside.loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {aside.loadError}
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Recettes mises de côté">
              {aside.items.map((item) => {
                const Icon = inboxKind(item) === 'photos' ? Images : Link2
                return (
                  <li key={item.id} data-testid="aside-item" className="flex items-center gap-2 rounded-lg border p-2.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{inboxSubtitle(item)}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 shrink-0 px-2.5"
                      aria-label={`Préremplir et enregistrer « ${item.title} »`}
                      onClick={() => void navigate('/recettes/nouvelle', { state: { fromInbox: item } satisfies NavState })}
                    >
                      <ScanText /> <span className="max-sm:hidden">Préremplir</span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour « ${item.title} »`} />}>
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {item.url && (
                          <DropdownMenuItem render={<a href={item.url} target="_blank" rel="noreferrer noopener" />}>
                            <ExternalLink /> Ouvrir le lien
                          </DropdownMenuItem>
                        )}
                        {planning && (
                          <DropdownMenuItem onClick={() => void aside.move(item, 'plan')}>
                            <CalendarPlus /> Mettre « À planifier »
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(item)}>
                          <Trash2 /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <RemoveInboxItemDialog item={removing} onClose={() => setRemoving(null)} onConfirm={aside.remove} />
    </section>
  )
}

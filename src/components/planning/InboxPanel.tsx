import { useDraggable } from '@dnd-kit/core'
import { BookmarkCheck, CalendarPlus, ChevronDown, ExternalLink, Inbox, Lightbulb, Link2, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { InboxState } from '@/hooks/useInbox'
import { inboxKind, inboxSubtitle, type InboxItem } from '@/lib/inbox'
import { cn } from '@/lib/utils'

/** Données transportées pendant le glisser-déposer d'un élément vers un créneau. */
export interface InboxDragData {
  inbox: InboxItem
}

interface CardProps {
  item: InboxItem
  onPlan: (item: InboxItem) => void
  onRename: (item: InboxItem) => void
  onRemove: (item: InboxItem) => void
}

const KIND_ICON = { recipe: BookmarkCheck, link: Link2, idea: Lightbulb } as const

function InboxCard({ item, onPlan, onRename, onRemove }: CardProps) {
  const drag = useDraggable({ id: `inbox:${item.id}`, data: { inbox: item } satisfies InboxDragData })
  const kind = inboxKind(item)
  const Icon = KIND_ICON[kind]
  const stop = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <li
      ref={drag.setNodeRef}
      // Glisser (souris) ou appui long (tactile) vers un créneau ; sinon bouton « Planifier ».
      {...drag.listeners}
      data-testid="inbox-item"
      className={cn(
        'flex touch-manipulation items-start gap-2 rounded-lg border bg-background p-2.5 shadow-xs select-none hover:shadow-sm',
        drag.isDragging && 'opacity-40',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', kind === 'recipe' ? 'text-brand' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0 flex-1">
        {kind === 'recipe' ? (
          <Link to={`/recettes/${item.recipe_id}`} onPointerDown={stop} className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
            {item.title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
        )}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{inboxSubtitle(item)}</p>
      </div>
      <Button variant="ghost" size="icon" aria-label={`Planifier « ${item.title} »`} onPointerDown={stop} onClick={() => onPlan(item)}>
        <CalendarPlus />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour « ${item.title} »`} onPointerDown={stop} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {item.url && (
            <DropdownMenuItem render={<a href={item.url} target="_blank" rel="noreferrer noopener" />}>
              <ExternalLink /> Ouvrir le lien
            </DropdownMenuItem>
          )}
          {kind !== 'recipe' && (
            <DropdownMenuItem onClick={() => onRename(item)}>
              <Pencil /> Renommer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => onRemove(item)}>
            <Trash2 /> Retirer de la liste
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

interface Props {
  inbox: InboxState
  onPlan: (item: InboxItem) => void
  onRename: (item: InboxItem) => void
}

/** Liste « À planifier » : liens, recettes et idées à répartir sur la semaine. */
export function InboxPanel({ inbox, onPlan, onRename }: Props) {
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  // Sur téléphone, le panneau est replié par défaut pour laisser la place au planning.
  const [open, setOpen] = useState(false)
  const count = inbox.items.length

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setAdding(true)
    const ok = await inbox.add(text)
    setAdding(false)
    if (ok) setText('')
  }

  return (
    <section aria-labelledby="inbox-heading" className="rounded-2xl border bg-background shadow-xs lg:sticky lg:top-6">
      <h2 id="inbox-heading">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 w-full items-center gap-2 rounded-2xl px-4 py-3 text-left font-semibold tracking-tight focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:pointer-events-none"
        >
          <Inbox className="size-4 text-brand" aria-hidden />
          <span className="flex-1">À planifier</span>
          {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{count}</span>}
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform lg:hidden', !open && '-rotate-90')} aria-hidden />
        </button>
      </h2>

      <div className={cn('space-y-3 border-t px-3 pt-3 pb-3', !open && 'hidden lg:block')}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Coller un lien ou noter une idée"
            aria-label="Lien ou idée à planifier"
            disabled={adding}
            className="h-9"
          />
          <Button type="submit" size="icon-lg" aria-label="Ajouter à la liste" disabled={adding || !text.trim()}>
            {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus />}
          </Button>
        </form>

        {inbox.loadError ? (
          <div role="alert" className="space-y-2 text-sm">
            <p className="text-destructive">{inbox.loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void inbox.reload()}>
              <RefreshCw /> Réessayer
            </Button>
          </div>
        ) : inbox.loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Chargement de la liste">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : count === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            Rien en attente. Ajoute des liens ici, ou partage-les depuis ton téléphone vers l'app.
          </p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="Éléments à planifier">
              {inbox.items.map((item) => (
                <InboxCard key={item.id} item={item} onPlan={onPlan} onRename={onRename} onRemove={(i) => void inbox.remove(i)} />
              ))}
            </ul>
            <p className="px-1 text-xs text-muted-foreground">Glisse un élément sur un créneau, ou utilise le bouton calendrier.</p>
          </>
        )}
      </div>
    </section>
  )
}

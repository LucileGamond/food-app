import { MoreHorizontal, Pencil, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToday } from '@/hooks/useToday'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { ListNameDialog } from '@/components/shopping/ListNameDialog'
import { useApi } from '@/app/ApiContext'
import { useShoppingLists } from '@/hooks/useShoppingLists'
import { type IsoDate } from '@/lib/dates'
import { defaultListName, listProgress, type ShoppingList } from '@/lib/shopping'

type DialogState = { kind: 'none' } | { kind: 'create' } | { kind: 'rename' | 'delete'; list: ShoppingList }

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ShoppingListsPage({ today: fixedToday }: { today?: IsoDate }) {
  const today = useToday(fixedToday)
  const api = useApi()
  const navigate = useNavigate()
  const shopping = useShoppingLists(api)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const close = () => setDialog({ kind: 'none' })
  const target = dialog.kind === 'rename' || dialog.kind === 'delete' ? dialog.list : null

  const createButton = (
    <Button className="h-10 px-4" onClick={() => setDialog({ kind: 'create' })}>
      <Plus /> Nouvelle liste
    </Button>
  )

  return (
    <>
      <PageHeader title="Courses" description="Listes de courses partagées" actions={createButton} />

      <div className="space-y-4">
        {shopping.loadError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{shopping.loadError}</p>
            <Button variant="outline" onClick={() => void shopping.reload()}>
              <RefreshCw /> Réessayer
            </Button>
          </div>
        ) : shopping.loading ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Chargement des listes">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : shopping.lists.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Aucune liste" description="Crée une liste pour noter ce qu'il faut acheter." action={createButton} />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2" aria-label="Listes de courses">
            {shopping.lists.map((list) => {
              const done = list.total > 0 && list.checked === list.total
              return (
                <li key={list.id} className="relative flex items-center gap-2 rounded-2xl border bg-background p-4 shadow-xs hover:shadow-sm">
                  <Link to={`/courses/${list.id}`} className="min-w-0 flex-1 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
                    <p className="truncate font-medium">{list.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className={done ? 'font-medium text-brand' : undefined}>
                        {list.total === 0 ? 'Vide' : `${listProgress(list)} article${list.total > 1 ? 's' : ''}`}
                      </span>
                      {' · '}modifiée le {dateFormatter.format(new Date(list.updated_at))}
                    </p>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" className="relative z-10" aria-label={`Actions pour « ${list.name} »`} />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setDialog({ kind: 'rename', list })}>
                        <Pencil /> Renommer
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: 'delete', list })}>
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

      <ListNameDialog
        open={dialog.kind === 'create' || dialog.kind === 'rename'}
        onOpenChange={(open) => !open && close()}
        title={dialog.kind === 'rename' ? 'Renommer la liste' : 'Nouvelle liste'}
        initialName={dialog.kind === 'rename' ? dialog.list.name : defaultListName(today)}
        confirmLabel={dialog.kind === 'rename' ? 'Enregistrer' : 'Créer'}
        onSubmit={async (name) => {
          if (dialog.kind === 'rename') return shopping.rename(dialog.list.id, name)
          const id = await shopping.create(name)
          if (id) navigate(`/courses/${id}`)
          return id !== null
        }}
      />

      <ConfirmDialog
        open={dialog.kind === 'delete'}
        onOpenChange={(open) => !open && close()}
        title="Supprimer cette liste ?"
        description={
          target
            ? `${target.name}${target.total > 0 ? ` : ${target.total} article${target.total > 1 ? 's seront supprimés' : ' sera supprimé'}.` : '.'}`
            : undefined
        }
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (target) await shopping.remove(target.id)
        }}
      />
    </>
  )
}

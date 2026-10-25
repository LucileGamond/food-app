import { ArrowLeft, CheckCheck, MoreHorizontal, Pencil, RefreshCw, SearchX, ShoppingBasket, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { ItemDialog } from '@/components/shopping/ItemDialog'
import { ListNameDialog } from '@/components/shopping/ListNameDialog'
import { QuickAddBar } from '@/components/shopping/QuickAddBar'
import { ShoppingItemRow } from '@/components/shopping/ShoppingItemRow'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { useShoppingList } from '@/hooks/useShoppingList'
import { groupByAisle, listProgress, type ShoppingItem } from '@/lib/shopping'
import { cn } from '@/lib/utils'

type DialogState =
  | { kind: 'none' }
  | { kind: 'edit'; item: ShoppingItem }
  | { kind: 'deleteItem'; item: ShoppingItem }
  | { kind: 'rename' | 'deleteList' | 'clear' }

export function ShoppingListPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const navigate = useNavigate()
  const list = useShoppingList(api, id)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const close = () => setDialog({ kind: 'none' })

  const { groups, checked } = groupByAisle(list.items)
  const progress = { total: list.items.length, checked: checked.length }
  const back = (
    <Link to="/courses" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> Courses
    </Link>
  )

  if (list.loadError) {
    return (
      <>
        {back}
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{list.loadError}</p>
          <Button variant="outline" onClick={() => void list.reload()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      </>
    )
  }

  if (list.loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement de la liste">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    )
  }

  if (list.notFound) {
    return (
      <EmptyState
        icon={SearchX}
        title="Liste introuvable"
        description="Elle a peut-être été supprimée."
        action={
          <Link to="/courses" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
            Retour aux listes
          </Link>
        }
      />
    )
  }

  async function renameList(name: string) {
    try {
      await api.shopping.renameList(id, name)
      toast.success('Liste renommée')
      void list.reload()
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function deleteList() {
    try {
      await api.shopping.deleteList(id)
      toast.success('Liste supprimée')
      navigate('/courses', { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const editItem = (item: ShoppingItem) => setDialog({ kind: 'edit', item })
  const toggle = (item: ShoppingItem) => void list.toggle(item)

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{list.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.total === 0 ? 'Liste vide' : `${listProgress(progress)} dans le caddie`}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Actions sur la liste" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setDialog({ kind: 'rename' })}>
              <Pencil /> Renommer
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: 'deleteList' })}>
              <Trash2 /> Supprimer la liste
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="sticky top-14 z-20 -mx-4 border-b bg-page/95 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:rounded-2xl md:border md:bg-background/95 md:px-4 md:shadow-xs">
        <QuickAddBar onAdd={list.add} />
      </div>

      <div className="mt-4 space-y-4">
        {progress.total === 0 && (
          <EmptyState icon={ShoppingBasket} title="Ajoute ton premier article" description="Le rayon est deviné à partir du nom ; tu peux le changer." />
        )}

        {groups.map((group) => (
          <section key={group.aisle} aria-labelledby={`aisle-${group.aisle}`} className="rounded-2xl border bg-background px-2 py-2 shadow-xs">
            <h2 id={`aisle-${group.aisle}`} className="px-2 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h2>
            <ul className="divide-y">
              {group.items.map((item) => (
                <ShoppingItemRow key={item.id} item={item} onToggle={toggle} onEdit={editItem} />
              ))}
            </ul>
          </section>
        ))}

        {progress.total > 0 && groups.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-4 text-sm font-medium text-brand">
            <CheckCheck className="size-4" aria-hidden /> Tout est dans le caddie
          </p>
        )}

        {checked.length > 0 && (
          <section aria-labelledby="checked-title" className="rounded-2xl border border-dashed px-2 py-2">
            <div className="flex items-center justify-between gap-2 px-2">
              <h2 id="checked-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Dans le caddie ({checked.length})
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'clear' })}>
                <Trash2 /> Retirer les cochés
              </Button>
            </div>
            <ul className="divide-y">
              {checked.map((item) => (
                <ShoppingItemRow key={item.id} item={item} onToggle={toggle} onEdit={editItem} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <ItemDialog
        item={dialog.kind === 'edit' ? dialog.item : null}
        onOpenChange={(open) => !open && close()}
        onSubmit={list.update}
        onDelete={(item) => setDialog({ kind: 'deleteItem', item })}
      />

      <ListNameDialog
        open={dialog.kind === 'rename'}
        onOpenChange={(open) => !open && close()}
        title="Renommer la liste"
        initialName={list.name ?? ''}
        confirmLabel="Enregistrer"
        onSubmit={renameList}
      />

      <ConfirmDialog
        open={dialog.kind === 'deleteItem'}
        onOpenChange={(open) => !open && close()}
        title="Supprimer cet article ?"
        description={dialog.kind === 'deleteItem' ? dialog.item.name : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (dialog.kind === 'deleteItem') await list.remove(dialog.item)
        }}
      />

      <ConfirmDialog
        open={dialog.kind === 'clear'}
        onOpenChange={(open) => !open && close()}
        title="Retirer les articles cochés ?"
        description={`${checked.length} article${checked.length > 1 ? 's' : ''} dans le caddie ${checked.length > 1 ? 'seront retirés' : 'sera retiré'} de la liste.`}
        confirmLabel="Retirer"
        onConfirm={list.clearChecked}
      />

      <ConfirmDialog
        open={dialog.kind === 'deleteList'}
        onOpenChange={(open) => !open && close()}
        title="Supprimer cette liste ?"
        description={`${list.name}${progress.total > 0 ? ` : ${progress.total} article${progress.total > 1 ? 's seront supprimés' : ' sera supprimé'}.` : '.'}`}
        confirmLabel="Supprimer"
        onConfirm={deleteList}
      />
    </div>
  )
}

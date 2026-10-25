import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import { findMergeTarget, formatAmount, nextPosition, type ShoppingItem, type ShoppingItemInput } from '@/lib/shopping'

export interface ShoppingListState {
  name: string | null
  items: ShoppingItem[]
  loading: boolean
  notFound: boolean
  loadError: string | null
  reload: () => Promise<void>
  /** Ajoute un article, ou additionne sa quantité à un article identique déjà présent. */
  add: (input: ShoppingItemInput) => Promise<boolean>
  toggle: (item: ShoppingItem) => Promise<void>
  update: (item: ShoppingItem, input: ShoppingItemInput) => Promise<boolean>
  remove: (item: ShoppingItem) => Promise<void>
  clearChecked: () => Promise<void>
}

const TEMP_PREFIX = 'tmp-'

/** Article tout juste ajouté, pas encore enregistré (identifiant provisoire) : on attend avant de le modifier. */
function isSaving(item: ShoppingItem): boolean {
  if (!item.id.startsWith(TEMP_PREFIX)) return false
  toast.info('Enregistrement en cours, réessaie dans un instant')
  return true
}

/**
 * Une liste de courses et ses articles. Toutes les écritures sont optimistes (au magasin, cocher doit
 * être instantané) ; un rechargement temps réel pendant une écriture est reporté à la fin de celle-ci.
 */
export function useShoppingList(api: Api, listId: string): ShoppingListState {
  const [name, setName] = useState<string | null>(null)
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  const pending = useRef(0)
  const reloadDeferred = useRef(false)
  const tempSeq = useRef(0)
  const latestItems = useRef(items)
  useEffect(() => {
    latestItems.current = items
  })

  const reload = useCallback(async () => {
    if (pending.current > 0) {
      reloadDeferred.current = true
      return
    }
    const id = ++requestId.current
    try {
      const [list, data] = await Promise.all([api.shopping.getList(listId), api.shopping.listItems(listId)])
      if (id !== requestId.current) return
      if (pending.current > 0) {
        reloadDeferred.current = true
        return
      }
      setNotFound(list === null)
      setName(list?.name ?? null)
      setItems(data)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api, listId])

  useEffect(() => {
    setLoading(true)
    void reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = api.shopping.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [api, reload])

  const latestReload = useRef(reload)
  useEffect(() => {
    latestReload.current = reload
  })

  /** Écriture optimiste : `apply` tout de suite, `rollback` si le serveur refuse. */
  const write = useCallback(
    async (apply: () => void, action: () => Promise<void>, rollback: () => void): Promise<boolean> => {
      pending.current += 1
      apply()
      try {
        await action()
        return true
      } catch (error) {
        rollback()
        toast.error(errorMessage(error))
        return false
      } finally {
        pending.current -= 1
        if (pending.current === 0 && reloadDeferred.current) {
          reloadDeferred.current = false
          // Le dernier reload : la liste (ou la personne) a pu changer pendant l'écriture.
          void latestReload.current()
        }
      }
    },
    [],
  )

  const patchItem = (id: string, patch: Partial<ShoppingItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const add = useCallback(
    async (input: ShoppingItemInput) => {
      const current = latestItems.current.filter((i) => !i.id.startsWith(TEMP_PREFIX))
      const merge = findMergeTarget(current, input)
      if (merge) {
        const before = merge.item
        if (merge.quantity === null) {
          toast.info(`« ${before.name} » est déjà dans la liste`)
          return true
        }
        const ok = await write(
          () => patchItem(before.id, { quantity: merge.quantity }),
          () => api.shopping.updateItem(before.id, { quantity: merge.quantity }),
          () => patchItem(before.id, { quantity: before.quantity }),
        )
        if (ok) toast.success(`Quantité ajoutée à « ${before.name} » (${formatAmount({ quantity: merge.quantity, unit: before.unit })})`)
        return ok
      }
      const position = nextPosition(latestItems.current)
      const temp: ShoppingItem = { id: `${TEMP_PREFIX}${++tempSeq.current}`, list_id: listId, checked: false, position, ...input }
      return write(
        () => setItems((list) => [...list, temp]),
        async () => {
          const saved = await api.shopping.addItem(listId, input, position)
          setItems((list) => list.map((i) => (i.id === temp.id ? saved : i)))
        },
        () => setItems((list) => list.filter((i) => i.id !== temp.id)),
      )
    },
    [api, listId, write],
  )

  const toggle = useCallback(
    async (item: ShoppingItem) => {
      if (item.id.startsWith(TEMP_PREFIX)) return
      await write(
        () => patchItem(item.id, { checked: !item.checked }),
        () => api.shopping.updateItem(item.id, { checked: !item.checked }),
        () => patchItem(item.id, { checked: item.checked }),
      )
    },
    [api, write],
  )

  const update = useCallback(
    async (item: ShoppingItem, input: ShoppingItemInput) => {
      if (isSaving(item)) return false
      return write(
        () => patchItem(item.id, input),
        () => api.shopping.updateItem(item.id, input),
        () => patchItem(item.id, item),
      )
    },
    [api, write],
  )

  const remove = useCallback(
    async (item: ShoppingItem) => {
      if (isSaving(item)) return
      await write(
        () => setItems((list) => list.filter((i) => i.id !== item.id)),
        () => api.shopping.deleteItem(item.id),
        () => setItems((list) => (list.some((i) => i.id === item.id) ? list : [...list, item])),
      )
    },
    [api, write],
  )

  const clearChecked = useCallback(async () => {
    const removed = latestItems.current.filter((i) => i.checked)
    await write(
      () => setItems((list) => list.filter((i) => !i.checked)),
      () => api.shopping.clearChecked(listId),
      () => setItems((list) => [...list, ...removed.filter((r) => !list.some((i) => i.id === r.id))]),
    )
  }, [api, listId, write])

  return { name, items, loading, notFound, loadError, reload, add, toggle, update, remove, clearChecked }
}

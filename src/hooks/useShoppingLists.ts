import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import type { ShoppingList } from '@/lib/shopping'

export interface ShoppingListsState {
  lists: ShoppingList[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  /** Crée une liste et renvoie son id (null en cas d'erreur). */
  create: (name: string) => Promise<string | null>
  rename: (id: string, name: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

/** Listes de courses du foyer, rechargées en temps réel. */
export function useShoppingLists(api: Api): ShoppingListsState {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const data = await api.shopping.listLists()
      if (id !== requestId.current) return
      setLists(data)
      setLoadError(null)
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [api])

  useEffect(() => {
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

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | null> => {
      try {
        const result = await action()
        if (success) toast.success(success)
        return result
      } catch (error) {
        toast.error(errorMessage(error))
        return null
      } finally {
        void reload()
      }
    },
    [reload],
  )

  return {
    lists,
    loading,
    loadError,
    reload,
    create: (name) => run(() => api.shopping.createList(name)),
    rename: async (id, name) => (await run(() => api.shopping.renameList(id, name).then(() => true), 'Liste renommée')) ?? false,
    remove: async (id) => (await run(() => api.shopping.deleteList(id).then(() => true), 'Liste supprimée')) ?? false,
  }
}

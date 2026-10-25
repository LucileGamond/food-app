import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage, type Api } from '@/api'
import { parseInboxInput, type InboxItem } from '@/lib/inbox'
import type { SlotRef } from '@/lib/meals'
import { siteName } from '@/lib/recipes'

export interface InboxState {
  items: InboxItem[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
  /** Ajoute un lien ou une idée saisi(e) ou partagé(e) ; le titre d'un lien est complété ensuite. */
  add: (text: string, sharedTitle?: string | null) => Promise<boolean>
  rename: (id: string, title: string) => Promise<boolean>
  remove: (item: InboxItem) => Promise<void>
  /** Crée le repas et retire l'élément (mise à jour optimiste). */
  plan: (item: InboxItem, target: SlotRef, people: string[]) => Promise<boolean>
}

/** Liste « À planifier », partagée et rechargée en temps réel. */
export function useInbox(api: Api): InboxState {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)

  const reload = useCallback(async () => {
    const id = ++requestId.current
    try {
      const list = await api.inbox.listItems()
      if (id !== requestId.current) return
      setItems(list)
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
    const unsubscribe = api.inbox.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [api, reload])

  const add = useCallback(
    async (text: string, sharedTitle?: string | null) => {
      const input = parseInboxInput(text, sharedTitle)
      if (!input) return false
      try {
        const id = await api.inbox.addItem(input.kind === 'link' ? { url: input.url, title: input.title } : { title: input.title })
        await reload()
        // Lien sans titre partagé : le titre provisoire (nom du site) est remplacé par celui de la page.
        if (input.kind === 'link' && !sharedTitle?.trim()) {
          void api.inbox.fetchTitle(input.url).then(async (title) => {
            if (!title || title === siteName(input.url)) return
            try {
              await api.inbox.renameItem(id, title)
              await reload()
            } catch {
              // Le titre provisoire reste : rien de bloquant.
            }
          })
        }
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      }
    },
    [api, reload],
  )

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        await api.inbox.renameItem(id, title)
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        void reload()
      }
    },
    [api, reload],
  )

  const remove = useCallback(
    async (item: InboxItem) => {
      setItems((list) => list.filter((i) => i.id !== item.id))
      try {
        await api.inbox.deleteItem(item.id)
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        void reload()
      }
    },
    [api, reload],
  )

  const plan = useCallback(
    async (item: InboxItem, target: SlotRef, people: string[]) => {
      setItems((list) => list.filter((i) => i.id !== item.id))
      try {
        await api.inbox.planItem(item.id, target.date, target.slot, people)
        return true
      } catch (error) {
        toast.error(errorMessage(error))
        return false
      } finally {
        void reload()
      }
    },
    [api, reload],
  )

  return { items, loading, loadError, reload, add, rename, remove, plan }
}

import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import { parseInboxInput } from '@/lib/inbox'

/**
 * Cible du partage Android (`share_target` du manifeste) : /partage?url=…&text=…&title=…
 * Ajoute le lien (ou le texte) à la liste « À planifier », puis ouvre le planning.
 */
export function SharePage() {
  const api = useApi()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const done = useRef(false)

  useEffect(() => {
    // Une seule fois, même si l'effet est rejoué (mode strict).
    if (done.current) return
    done.current = true
    const text = [params.get('url'), params.get('text')].filter(Boolean).join(' ')
    const input = parseInboxInput(text, params.get('title'))
    const finish = () => navigate('/planning', { replace: true })
    if (!input) {
      toast.error('Rien à ajouter : le partage ne contenait ni lien ni texte.')
      finish()
      return
    }
    const add = input.kind === 'link' ? api.inbox.addItem({ url: input.url, title: input.title }) : api.inbox.addItem({ title: input.title })
    add.then(
      (id) => {
        toast.success(`Ajouté à « À planifier » : ${input.title}`)
        // Titre partagé absent : celui de la page est récupéré en arrière-plan (le planning se met à jour en direct).
        if (input.kind === 'link' && !params.get('title')?.trim()) {
          void api.inbox.fetchTitle(input.url).then(async (title) => {
            if (title) await api.inbox.renameItem(id, title, input.title).catch(() => undefined)
          })
        }
        finish()
      },
      (error: unknown) => {
        toast.error(errorMessage(error))
        finish()
      },
    )
  }, [api, navigate, params])

  return <FullPageSpinner />
}

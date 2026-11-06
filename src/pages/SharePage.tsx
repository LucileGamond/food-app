import { Link2, ScanText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { PageHeader } from '@/components/PageHeader'
import { ImportChoices } from '@/components/recipes/ImportChoices'
import { useApi } from '@/app/ApiContext'
import { useSettings } from '@/app/SettingsContext'
import { errorMessage } from '@/api'
import { MAX_INBOX_PHOTOS, parseInboxInput } from '@/lib/inbox'
import type { ImportSource } from '@/services/quickImport'
import { siteName } from '@/lib/recipes'
import { HOME_PATH } from '@/lib/settings'
import { handOffPhotos, takeSharedPhotos } from '@/lib/sharedPhotos'
import type { NavState } from '@/lib/navState'

/**
 * Cible du partage Android (`share_target` du manifeste) : /partage?url=…&text=…&title=…, ou /partage?photos=partage
 * (photos rangées par le service worker). Un lien ou des photos : au choix, enregistrer directement, mettre de côté,
 * à planifier, ou préremplir le formulaire. Un texte sans lien : une idée ajoutée à « À planifier ».
 */
export function SharePage() {
  const api = useApi()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { loading, isEnabled, settings } = useSettings()
  const [source, setSource] = useState<ImportSource | null>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const done = useRef(false)

  useEffect(() => {
    // Une seule fois (même si l'effet est rejoué en mode strict), une fois les réglages connus.
    if (done.current || loading) return
    done.current = true

    if (params.get('photos') === 'partage') {
      void takeSharedPhotos().then((files) => {
        if (files.length === 0) {
          toast.error('Aucune photo reçue : choisis-la depuis « Nouvelle recette »')
          return navigate('/recettes/nouvelle', { replace: true })
        }
        const kept = files.slice(0, MAX_INBOX_PHOTOS)
        setPreviews(kept.map((f) => URL.createObjectURL(f)))
        setSource({ kind: 'photos', files: kept })
      })
      return
    }

    const text = [params.get('url'), params.get('text')].filter(Boolean).join(' ')
    const input = parseInboxInput(text, params.get('title'))
    if (input?.kind === 'link') {
      setSource({ kind: 'link', url: input.url, title: params.get('title')?.trim() || null })
      return
    }

    // Pas de lien : une idée de repas, ajoutée à « À planifier ».
    const planning = isEnabled('planning')
    const finish = () => void navigate(planning ? '/planning' : HOME_PATH, { replace: true })
    if (!input) {
      toast.error('Rien à ajouter : le partage ne contenait ni lien ni texte')
      finish()
      return
    }
    if (!planning) {
      toast.error('Le Planning est masqué dans tes réglages : l’idée n’a pas été ajoutée')
      finish()
      return
    }
    api.inbox.addItem({ title: input.title }).then(
      () => {
        toast.success(`Ajoutée à « À planifier » : ${input.title}`)
        finish()
      },
      (error: unknown) => {
        toast.error(errorMessage(error))
        finish()
      },
    )
  }, [api, navigate, params, loading, isEnabled, settings])

  // Libère les aperçus des photos.
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  if (!source) return <FullPageSpinner />

  /** Préremplir dans le formulaire, pour vérifier avant d'enregistrer. */
  function prefill() {
    if (source!.kind === 'link') {
      void navigate('/recettes/nouvelle', { state: { importUrl: source!.url } satisfies NavState })
      return
    }
    handOffPhotos(source!.files)
    void navigate('/recettes/nouvelle?photos=partage')
  }

  return (
    <>
      <PageHeader title="Recette partagée" description="Que veux-tu en faire ?" />
      <section className="space-y-5 rounded-2xl border bg-background p-5 shadow-xs">
        {source.kind === 'link' ? (
          <p className="flex items-start gap-2 text-sm">
            <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium break-words">{source.title || siteName(source.url)}</span>
              <span className="block text-muted-foreground break-all">{source.url}</span>
            </span>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Photos partagées">
            {previews.map((url, i) => (
              <li key={url}>
                <img src={url} alt={`Photo ${i + 1}`} className="h-24 w-20 rounded-lg border object-cover" />
              </li>
            ))}
          </ul>
        )}

        <ImportChoices
          source={source}
          onIncomplete={(message) => {
            toast.error(`Recette incomplète (${message}) : vérifie-la dans le formulaire`)
            prefill()
          }}
        />

        {isEnabled('recettes') ? (
          <div className="space-y-1 border-t pt-4">
            <Button type="button" variant="outline" className="h-10 px-3" onClick={prefill}>
              <ScanText aria-hidden /> Préremplir le formulaire
            </Button>
            <p className="text-xs text-muted-foreground">Pour vérifier la recette avant de l’enregistrer.</p>
          </div>
        ) : (
          !isEnabled('planning') && <p className="text-sm text-muted-foreground">Affiche Recettes ou Planning dans les réglages pour garder cette recette.</p>
        )}
      </section>
    </>
  )
}

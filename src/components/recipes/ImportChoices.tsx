import { Archive, CalendarPlus, Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useApi } from '@/app/ApiContext'
import { errorMessage } from '@/api'
import type { InboxList } from '@/lib/inbox'
import { keepForLater, saveDirectly, type ImportSource } from '@/lib/quickImport'
import { cn } from '@/lib/utils'
import { useSettings } from '@/app/SettingsContext'

type Action = 'save' | InboxList

interface Props {
  /** Lien ou photos à importer ; null : pas encore choisi (boutons désactivés). */
  source: ImportSource | null
  /** Recette incomplète après « Enregistrer directement » : la finir dans le formulaire. */
  onIncomplete: (message: string) => void
  className?: string
}

/**
 * Ce qu'on fait d'une recette importée : l'enregistrer directement (analyse, sans formulaire), ou la garder pour plus
 * tard sans l'analyser, dans « De côté » ou dans « À planifier ».
 */
export function ImportChoices({ source, onIncomplete, className }: Props) {
  const api = useApi()
  const navigate = useNavigate()
  const { isEnabled } = useSettings()
  const [running, setRunning] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: Action) {
    if (!source) return
    setRunning(action)
    setError(null)
    try {
      if (action === 'save') {
        const tags = await api.recipes.listTags().catch(() => [] as string[])
        const result = await saveDirectly(api, source, tags)
        if (result.kind === 'incomplete') return onIncomplete(result.message)
        if (result.kind === 'duplicate') {
          toast.info(`Déjà enregistrée : ${result.recipe.title}`)
          return navigate(`/recettes/${result.recipe.id}`)
        }
        const [first] = result.recipes
        if (result.recipes.length === 1) {
          toast.success(`Recette enregistrée : ${first!.title}`)
          return navigate(`/recettes/${first!.id}`)
        }
        toast.success(`${result.recipes.length} recettes enregistrées`)
        return navigate('/recettes')
      }
      await keepForLater(api, source, action)
      toast.success(action === 'aside' ? 'Mise de côté : retrouve-la dans Recettes, « De côté »' : 'Ajoutée à « À planifier »')
      navigate(action === 'aside' ? '/recettes' : '/planning')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRunning(null)
    }
  }

  const busy = running !== null
  const icon = (action: Action, Icon: typeof Save) => (running === action ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />)

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Que faire de cette recette ?">
        {/* Recette enregistrée et « De côté » : dans Recettes ; « À planifier » : dans le Planning. */}
        {isEnabled('recettes') && (
          <>
            <Button type="button" className="h-10 px-3" disabled={!source || busy} onClick={() => void run('save')}>
              {icon('save', Save)} Enregistrer directement
            </Button>
            <Button type="button" variant="outline" className="h-10 bg-background px-3" disabled={!source || busy} onClick={() => void run('aside')}>
              {icon('aside', Archive)} Mettre de côté
            </Button>
          </>
        )}
        {isEnabled('planning') && (
          <Button type="button" variant="outline" className="h-10 bg-background px-3" disabled={!source || busy} onClick={() => void run('plan')}>
            {icon('plan', CalendarPlus)} À planifier
          </Button>
        )}
      </div>
      {running === 'save' && <p className="text-sm text-muted-foreground" aria-live="polite">Analyse et enregistrement de la recette, quelques secondes…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

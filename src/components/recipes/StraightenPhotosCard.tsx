import { Loader2, RotateCw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { straightenAllPhotos, type StraightenProgress } from '@/services/uprightPhoto'

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Photos des recettes déjà enregistrées remises à l'endroit d'un coup (le modèle choisit le bon sens de chacune). */
export function StraightenPhotosCard() {
  const api = useApi()
  const [progress, setProgress] = useState<StraightenProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)
  // Page quittée : on s'arrête après la photo en cours.
  useEffect(() => () => void (stop.current = true), [])

  async function start() {
    stop.current = false
    setRunning(true)
    setError(null)
    try {
      await straightenAllPhotos(api, setProgress, () => stop.current)
    } catch {
      setError('Les photos n’ont pas pu être chargées : réessaie.')
    } finally {
      setRunning(false)
    }
  }

  const done = progress !== null && !running
  return (
    <section className="mx-auto mt-4 max-w-2xl space-y-3 rounded-2xl border bg-background p-5 shadow-xs" aria-labelledby="straighten-title">
      <div className="space-y-1">
        <h2 id="straighten-title" className="font-medium">
          Photos de travers
        </h2>
        <p className="text-sm text-muted-foreground">Vérifie le sens de chaque photo de tes recettes et remet à l’endroit celles qui sont couchées ou à l’envers.</p>
      </div>
      {progress && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {done && progress.done === progress.total ? 'Terminé' : running ? 'Vérification' : 'Arrêté'} · {progress.done} / {progress.total}
          {progress.fixed > 0 && ` · ${plural(progress.fixed, 'photo')} remise${progress.fixed > 1 ? 's' : ''} à l’endroit`}
          {progress.failed > 0 && ` · ${plural(progress.failed, 'photo')} non vérifiée${progress.failed > 1 ? 's' : ''}`}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {running ? (
        <Button variant="outline" className="h-10 px-3" onClick={() => void (stop.current = true)}>
          <Loader2 className="animate-spin" aria-hidden />
          <Square /> Arrêter
        </Button>
      ) : (
        <Button variant="outline" className="h-10 px-3" onClick={() => void start()}>
          <RotateCw /> Redresser les photos
        </Button>
      )}
    </section>
  )
}

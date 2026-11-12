import { Pencil, Undo2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  /** Mailles au début : saisies, ou déduites de la fin du patron (null : inconnues). */
  start: number | null
  /** Saisies par la tricoteuse (sinon déduites). */
  set: boolean
  /** Mailles à la fin de l'étape d'avant, proposées pour enchaîner (null : rien à proposer). */
  previous: number | null
  /** null : revenir au calcul depuis la fin du patron. */
  onSave: (startStitches: number | null) => Promise<boolean>
}

const plural = (n: number) => `${n} maille${n > 1 ? 's' : ''}`

/**
 * Mailles au début de l'étape : les saisir les fait foi, et tout le reste se décale (mailles de chaque rang, de la fin) ;
 * reprendre celles de l'étape d'avant est proposé, jamais imposé (un dos et une manche se montent à part).
 */
export function StepStartStitches({ start, set, previous, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const n = Number(value.trim())
    if (!Number.isInteger(n) || n < 1 || n > 5000) return setError('Un nombre entier de mailles, entre 1 et 5000.')
    if (await onSave(n)) setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={submit} noValidate aria-label="Mailles au début" className="space-y-1.5">
        <Label htmlFor="start-stitches">Mailles au début de l’étape</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="start-stitches" className="h-9 w-28" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          <Button type="submit" className="h-9">
            Enregistrer
          </Button>
          <Button type="button" variant="ghost" className="h-9" onClick={() => setEditing(false)}>
            Annuler
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Les mailles de chaque rang et de la fin se recalculent : les augmentations et diminutions s’ajoutent à ce nombre.</p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span>
        <span className="text-muted-foreground">Mailles au début : </span>
        {start !== null ? plural(start) : 'inconnues'}
        {start !== null && !set && <span className="text-muted-foreground"> (d’après la fin du patron)</span>}
      </span>
      <Button
        variant="ghost"
        className="h-8 px-2"
        onClick={() => {
          setValue(start === null ? '' : String(start))
          setError(null)
          setEditing(true)
        }}
      >
        <Pencil /> Modifier <span className="sr-only">les mailles au début</span>
      </Button>
      {previous !== null && previous !== start && (
        <Button variant="outline" className="h-8 px-2" onClick={() => void onSave(previous)}>
          Reprendre les {plural(previous)} de l’étape d’avant
        </Button>
      )}
      {set && (
        <Button variant="ghost" className="h-8 px-2" onClick={() => void onSave(null)}>
          <Undo2 /> Revenir au patron
        </Button>
      )}
    </div>
  )
}

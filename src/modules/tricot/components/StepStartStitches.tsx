import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

interface Props {
  /** Mailles au début : saisies, ou déduites de la fin du patron (null : inconnues). */
  start: number | null
  /** Saisies par la tricoteuse (sinon déduites). */
  set: boolean
  /** Mailles à la fin de l'étape d'avant, proposées pour enchaîner (null : rien à proposer). */
  previous: number | null
  /** Mailles au début d'après le patron (null : inconnues) ; y revenir efface la saisie. */
  fromPattern: number | null
  /** null : revenir au calcul depuis la fin du patron. */
  onSave: (startStitches: number | null) => Promise<boolean>
}

const plural = (n: number) => `${n} maille${n > 1 ? 's' : ''}`

/**
 * Mailles au début de l'étape : les saisir les fait foi, et tout le reste se décale (mailles de chaque rang, de la fin).
 * Un seul bouton ouvre le choix : l'étape d'avant, le patron, ou un autre nombre (jamais imposé : un dos et une manche
 * se montent à part).
 */
export function StepStartStitches({ start, set, previous, fromPattern, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const n = Number(value.trim())
    if (!Number.isInteger(n) || n < 1 || n > 5000) return setError('Un nombre entier de mailles, entre 1 et 5000.')
    if (await onSave(n)) setEditing(false)
  }

  /** « Comme l'étape d'avant (80) », « Comme le patron (78) » : le même nombre n'est proposé qu'une fois. */
  const choices = [
    previous !== null && { value: `previous`, label: `Comme l’étape d’avant (${plural(previous)})`, stitches: previous },
    fromPattern !== null && previous !== fromPattern && { value: `pattern`, label: `Comme le patron (${plural(fromPattern)})`, stitches: fromPattern },
  ].filter((c): c is { value: string; label: string; stitches: number } => !!c)

  if (editing) {
    return (
      <form onSubmit={submit} noValidate aria-label="Mailles au début" className="space-y-1.5">
        {choices.length > 0 && (
          <div className="grid max-w-80 gap-1.5">
            <Label htmlFor="start-stitches-choice">Reprendre</Label>
            <NativeSelect
              id="start-stitches-choice"
              value={choices.find((c) => String(c.stitches) === value.trim())?.value ?? ''}
              onChange={(e) => {
                const chosen = choices.find((c) => c.value === e.target.value)
                setValue(chosen ? String(chosen.stitches) : '')
                setError(null)
              }}
            >
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value="">Un autre nombre</option>
            </NativeSelect>
          </div>
        )}
        <Label htmlFor="start-stitches">Mailles au début de l’étape</Label>
        <div className="flex flex-wrap gap-2">
          <Input id="start-stitches" className="h-9 w-28" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          <Button type="submit" className="h-9">
            Enregistrer
          </Button>
          {set && (
            <Button type="button" variant="ghost" className="h-9" onClick={() => void onSave(null).then((ok) => ok && setEditing(false))}>
              Laisser le patron décider
            </Button>
          )}
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
    <div className="flex flex-wrap items-center gap-x-2 text-sm">
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
    </div>
  )
}

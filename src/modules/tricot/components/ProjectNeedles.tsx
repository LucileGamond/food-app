import { Loader2, Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNeedle, parseNeedles } from '../lib/needles'

interface Props {
  needles: number[]
  onSave: (needles: number[]) => Promise<boolean>
}

/** Aiguilles du patron : chaque sous-étape choisit la sienne parmi elles. */
export function ProjectNeedles({ needles, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function edit() {
    setText(needles.map((n) => n.toLocaleString('fr-FR')).join(' ; '))
    setError(null)
    setEditing(true)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseNeedles(text)
    if (!parsed) return setError('Des tailles en mm, séparées par « ; » (ex. 3 ; 3,5).')
    setError(null)
    setSaving(true)
    // L'échec doit se voir : sans message, il ressemble à « il ne s'est rien passé ».
    const ok = await onSave(parsed)
    setSaving(false)
    if (ok) setEditing(false)
    else setError('Les aiguilles n’ont pas pu être enregistrées. Réessaie.')
  }

  if (editing) {
    return (
      <form onSubmit={submit} noValidate aria-label="Aiguilles du patron" className="space-y-1.5">
        <Label htmlFor="knit-needles">Aiguilles du patron (mm)</Label>
        <div className="flex gap-2">
          <Input id="knit-needles" className="h-10 max-w-48" value={text} onChange={(e) => setText(e.target.value)} placeholder="3 ; 3,5" aria-invalid={!!error} disabled={saving} />
          <Button type="button" variant="outline" className="h-10" onClick={() => setEditing(false)} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" className="h-10" disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            Enregistrer
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Aiguilles :</span>
      {needles.length ? <span>{needles.map(formatNeedle).join(' · ')}</span> : <span className="text-muted-foreground">aucune : indique-les pour que chaque sous-étape choisisse la sienne</span>}
      <Button variant="ghost" className="h-10 px-2" onClick={edit}>
        <Pencil /> Modifier <span className="sr-only">les aiguilles du patron</span>
      </Button>
    </div>
  )
}

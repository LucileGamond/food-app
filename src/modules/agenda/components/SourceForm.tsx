import { normalizeIcalUrl } from '@agenda/ical-url.ts'
import { Loader2, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const URL_HINT = 'Colle l’« adresse secrète au format iCal » de ton agenda Google (elle finit par « basic.ics »).'

/** Ajout d'un agenda Google par son adresse iCal secrète. `onAdd` renvoie vrai si l'agenda est ajouté. */
export function SourceForm({ busy, onAdd }: { busy: boolean; onAdd: (name: string, url: string) => Promise<boolean> }) {
  const [name, setName] = useState('Mon agenda')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeIcalUrl(url)
    if (!name.trim()) return setError('Donne un nom à cet agenda.')
    if (!normalized) return setError(URL_HINT)
    setError(null)
    if (await onAdd(name.trim(), normalized)) setUrl('')
  }

  return (
    <form onSubmit={(e) => void submit(e)} aria-labelledby="agenda-add" className="min-w-0 space-y-3 rounded-2xl border bg-background p-4 shadow-xs">
      <h2 id="agenda-add" className="font-semibold tracking-tight">
        Ajouter un agenda Google
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="agenda-name">Nom</Label>
        <Input id="agenda-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-10" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="agenda-url">Adresse secrète au format iCal</Label>
        <Input
          id="agenda-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby="agenda-url-help"
          className="h-10"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <details id="agenda-url-help" className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Où la trouver ?</summary>
          <p className="mt-1">
            Sur ordinateur, dans Google Agenda : Paramètres → choisis l’agenda (sous « Paramètres de mes agendas ») → Intégrer l’agenda → « Adresse secrète au format iCal ». Elle n’est jamais
            réaffichée, ni à toi ni à l’autre : seuls les rendez-vous sont partagés.
          </p>
        </details>
      </div>
      <Button type="submit" className="h-10" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        Ajouter
      </Button>
    </form>
  )
}

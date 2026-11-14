import { Download, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isReadableLink, type PatternLink } from '../lib/library'

interface Props {
  value: string
  onChange: (url: string) => void
  /** Ce que la lecture du lien a trouvé ; renvoie ce qu'il faut en dire. */
  onRead: (link: PatternLink) => Promise<string>
  /** Lire le lien dès l'affichage (lien partagé depuis le téléphone). */
  readOnMount?: boolean
  /** Lecture en cours ou finie : le formulaire attend qu'elle finisse pour enregistrer. */
  onReadingChange?: (reading: boolean) => void
}

/** Lien du patron, et « Récupérer depuis le lien » : PDF, nom et image de la page (sans l'IA, gratuit). */
export function PatternLinkField({ value, onChange, onRead, readOnMount = false, onReadingChange }: Props) {
  const api = useApi()
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const readable = isReadableLink(value)

  async function read() {
    setReading(true)
    onReadingChange?.(true)
    setMessage(null)
    try {
      setMessage({ text: await onRead(await api.knitting.readPatternLink(value.trim())), error: false })
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true })
    } finally {
      setReading(false)
      onReadingChange?.(false)
    }
  }

  // Une seule fois, même si l'effet est rejoué en mode strict.
  const started = useRef(false)
  useEffect(() => {
    if (!readOnMount || started.current || !readable) return
    started.current = true
    void read()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture au premier affichage seulement
  }, [])

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="pattern-url">Lien</Label>
      <div className="flex gap-2">
        <Input id="pattern-url" type="url" inputMode="url" className="h-10 min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />
        <Button type="button" variant="outline" className="h-10 shrink-0" disabled={!readable || reading} onClick={() => void read()}>
          {reading ? <Loader2 className="animate-spin" aria-hidden /> : <Download />} Récupérer
        </Button>
      </div>
      <p aria-live="polite" className={message?.error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {reading ? 'Lecture du lien…' : (message?.text ?? 'Récupérer : le PDF du lien ou de la page, son nom et sa photo, sans IA.')}
      </p>
    </div>
  )
}

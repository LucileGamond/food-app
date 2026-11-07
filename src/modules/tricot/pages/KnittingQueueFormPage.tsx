import { ChevronLeft, FileText, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/PageHeader'
import { MAX_PDF_BYTES } from '../lib/pattern'
import { parseQueueDraft, PRIORITIES, type QueueDraft, type QueuePriority } from '../lib/yarn'

/** Met un patron de côté pour plus tard : PDF ou lien, taille visée, laine envisagée, priorité. */
export function KnittingQueueFormPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<QueueDraft>({ title: '', url: '', size: '', yarnIdea: '', notes: '', priority: 2 })
  const [pdf, setPdf] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const change = (patch: Partial<QueueDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pdf && pdf.size > MAX_PDF_BYTES) return setError('PDF trop lourd (20 Mo au plus).')
    const parsed = parseQueueDraft(draft, pdf)
    if ('error' in parsed) return setError(parsed.error)
    setError(null)
    setSaving(true)
    try {
      await api.knitting.addToQueue(parsed.input)
      toast.success('Patron mis de côté')
      navigate('/tricot')
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <>
      <Link to="/tricot" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Tricot
      </Link>
      <PageHeader title="Patron pour plus tard" description="Garde-le ici ; « Commencer » le découpera en étapes le moment venu." />
      <form onSubmit={(e) => void submit(e)} className="max-w-lg space-y-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-title">Nom du patron</Label>
          <Input id="queue-title" className="h-10" maxLength={200} value={draft.title} onChange={(e) => change({ title: e.target.value })} placeholder="Pull Bergamote" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-pdf">Patron (PDF)</Label>
          <Input
            id="queue-pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="h-10"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              setPdf(file)
              if (file && !draft.title.trim()) change({ title: file.name.replace(/\.pdf$/i, '') })
            }}
          />
          {pdf && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="size-4" aria-hidden /> {pdf.name}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-url">Ou lien vers le patron</Label>
          <Input id="queue-url" type="url" inputMode="url" className="h-10" value={draft.url} onChange={(e) => change({ url: e.target.value })} placeholder="https://…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="queue-size">Taille visée</Label>
            <Input id="queue-size" className="h-10" maxLength={40} value={draft.size} onChange={(e) => change({ size: e.target.value })} placeholder="M, 4 ans…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="queue-priority">Quand</Label>
            <NativeSelect id="queue-priority" value={String(draft.priority)} onChange={(e) => change({ priority: Number(e.target.value) as QueuePriority })}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-yarn">Laine envisagée</Label>
          <Input id="queue-yarn" className="h-10" maxLength={200} value={draft.yarnIdea} onChange={(e) => change({ yarnIdea: e.target.value })} placeholder="Restes de mérinos bleu" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-notes">Notes</Label>
          <Textarea id="queue-notes" maxLength={2000} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Mettre de côté
        </Button>
      </form>
    </>
  )
}

import { FileText, Loader2, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/PageHeader'
import { describeSection, MAX_PDF_BYTES, type ReadPattern } from '../lib/pattern'
import { formatGauge, type QueuedPattern } from '../lib/yarn'

/**
 * Nouveau projet : PDF du patron + taille → étapes lues par le modèle, vérifiées puis enregistrées.
 * `?patron=<id>` : commence un patron mis de côté (son PDF et sa taille sont repris).
 */
export function KnittingImportPage() {
  const api = useApi()
  const navigate = useNavigate()
  const queuedId = useSearchParams()[0].get('patron')
  const [queued, setQueued] = useState<QueuedPattern | null>(null)
  const [pdf, setPdf] = useState<File | null>(null)
  const [size, setSize] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [pattern, setPattern] = useState<ReadPattern | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!queuedId) return
    let active = true
    void (async () => {
      try {
        const item = await api.knitting.getQueued(queuedId)
        if (!active) return
        if (!item?.pdfPath) return setError('Patron introuvable, ou sans PDF.')
        const file = await api.knitting.downloadPdf(item.pdfPath, item.title)
        if (!active) return
        setQueued(item)
        setPdf(file)
        setSize((current) => current || item.size || '')
      } catch (e) {
        if (active) setError(errorMessage(e))
      }
    })()
    return () => {
      active = false
    }
  }, [api, queuedId])

  async function read(event: FormEvent) {
    event.preventDefault()
    if (!pdf) return setError('Choisis le PDF du patron.')
    if (pdf.size > MAX_PDF_BYTES) return setError('PDF trop lourd (20 Mo au plus).')
    if (!size.trim()) return setError('Indique la taille choisie.')
    setError(null)
    setReading(true)
    try {
      const read = await api.knitting.readPattern(pdf, size.trim())
      setPattern(read)
      setTitle(read.title)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setReading(false)
    }
  }

  async function save() {
    if (!pattern) return
    setSaving(true)
    try {
      const id = await api.knitting.createProject({ title: title.trim() || pattern.title, size: size.trim(), pdf, steps: pattern.steps, gauge: pattern.gauge ?? null, queued })
      toast.success('Projet enregistré')
      navigate(`/tricot/${id}`)
    } catch (e) {
      toast.error(errorMessage(e))
      setSaving(false)
    }
  }

  if (pattern) {
    return (
      <>
        <PageHeader
          title="Vérifier les étapes"
          description={[`Taille ${size.trim()}`, `${pattern.steps.length} étapes`, pattern.gauge && formatGauge(pattern.gauge) && `échantillon ${formatGauge(pattern.gauge)}`].filter(Boolean).join(' · ')}
        />
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="knit-title">Nom du projet</Label>
            <Input id="knit-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <ol aria-label="Étapes lues" className="space-y-2">
            {pattern.steps.map((step, index) => (
              <li key={index} className="rounded-2xl border bg-background p-4 shadow-xs">
                <p className="font-medium">
                  {index + 1}. {step.title}
                </p>
                {step.instructions && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{step.instructions}</p>}
                {(step.totalRows || step.stitches) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[step.totalRows && `${step.totalRows} rangs`, step.stitches && `${step.stitches} mailles`].filter(Boolean).join(' · ')}
                  </p>
                )}
                {step.sections.length > 0 && (
                  <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs">
                    {step.sections.map((section, i) => (
                      <li key={i}>{describeSection(section)}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10" onClick={() => setPattern(null)} disabled={saving}>
              <RotateCcw /> Recommencer
            </Button>
            <Button className="h-10" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save />}
              Enregistrer le projet
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={queued ? `Commencer « ${queued.title} »` : 'Nouveau patron'}
        description="Le patron est découpé en étapes, avec seulement les nombres de ta taille."
      />
      <form onSubmit={(e) => void read(e)} className="max-w-lg space-y-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="knit-pdf">Patron (PDF)</Label>
          <Input
            id="knit-pdf"
            type="file"
            accept="application/pdf,.pdf"
            className="h-10"
            onChange={(e) => {
              setPdf(e.target.files?.[0] ?? null)
              // Autre PDF choisi : ce n'est plus le patron mis de côté.
              setQueued(null)
            }}
          />
          {pdf && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="size-4" aria-hidden /> {pdf.name}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="knit-size">Taille choisie</Label>
          <Input id="knit-size" className="h-10 w-40" value={size} onChange={(e) => setSize(e.target.value)} maxLength={40} placeholder="M, 38, 4 ans…" />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10" disabled={reading}>
          {reading && <Loader2 className="animate-spin" aria-hidden />}
          {reading ? 'Lecture du patron…' : 'Lire le patron'}
        </Button>
        {reading && <p className="text-sm text-muted-foreground">Ça peut prendre jusqu’à 2 minutes pour un long patron.</p>}
      </form>
    </>
  )
}

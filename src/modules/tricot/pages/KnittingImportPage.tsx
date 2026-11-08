import { BookmarkPlus, ChevronLeft, FileText, Grid3x3, Loader2, Play, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/PageHeader'
import { QueueForm } from '../components/QueueForm'
import { SizedText, SizePicker } from '../components/SizedText'
import { SizeAdvice } from '../components/SizeAdvice'
import { cn } from '@/lib/utils'
import { describeHint } from '../lib/chart'
import { useBaseGlossary } from '../hooks/useBaseGlossary'
import { looksEnglish, mergeGlossary } from '../lib/glossary'
import { sizeIndexOf } from '../lib/sizes'
import { describeSection, MAX_PDF_BYTES, type ReadPattern } from '../lib/pattern'
import { formatGauge, type QueuedPattern } from '../lib/yarn'

type Mode = 'start' | 'later'

/**
 * Nouveau patron, à commencer maintenant ou à mettre de côté :
 * - commencer : PDF du patron (+ taille, facultative) → étapes lues par le modèle, vérifiées puis enregistrées ;
 * - mettre de côté : PDF ou lien, taille visée, laine envisagée, priorité (`?plus-tard` : ce choix d'emblée).
 * `?patron=<id>` : commence un patron mis de côté (son PDF et sa taille sont repris, rien n'est redemandé).
 */
export function KnittingImportPage() {
  const api = useApi()
  const glossary = useBaseGlossary()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queuedId = params.get('patron')
  const [mode, setMode] = useState<Mode>(params.has('plus-tard') && !queuedId ? 'later' : 'start')
  const [queued, setQueued] = useState<QueuedPattern | null>(null)
  /** Patron mis de côté : PDF repris ; « Choisir un autre PDF » le remplace. */
  const [changingPdf, setChangingPdf] = useState(false)
  const [pdf, setPdf] = useState<File | null>(null)
  const [size, setSize] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [pattern, setPattern] = useState<ReadPattern | null>(null)
  const [title, setTitle] = useState('')
  const [sizeIndex, setSizeIndex] = useState<number | null>(null)
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
    await readFor(pdf, size.trim())
  }

  /** Lit le patron pour une taille ; relu pour la taille conseillée, le nom du projet donné est gardé. */
  async function readFor(file: File, chosenSize: string) {
    setError(null)
    setReading(true)
    try {
      const read = await api.knitting.readPattern(file, chosenSize)
      setSize(chosenSize)
      setTitle((current) => (pattern && current.trim() && current !== pattern.title ? current : read.title))
      setPattern(read)
      setSizeIndex(read.sizeIndex ?? sizeIndexOf(read.sizes, chosenSize))
    } catch (e) {
      if (pattern) toast.error(errorMessage(e))
      else setError(errorMessage(e))
    } finally {
      setReading(false)
    }
  }

  /** Taille du projet : celle indiquée, sinon celle prise par la lecture (la première du patron). */
  function readSize(read: ReadPattern): string {
    return size.trim() || (read.sizeIndex !== null && read.sizeIndex !== undefined ? read.sizes[read.sizeIndex] : undefined) || 'Unique'
  }

  async function save() {
    if (!pattern) return
    setSaving(true)
    try {
      const id = await api.knitting.createProject({ title: title.trim() || pattern.title, size: readSize(pattern), pdf, steps: pattern.steps, gauge: pattern.gauge ?? null, queued, chartHints: pattern.charts ?? [], sizes: pattern.sizes, sizeIndex, abbreviations: pattern.abbreviations ?? [] })
      toast.success('Projet enregistré')
      navigate(`/tricot/${id}`)
    } catch (e) {
      toast.error(errorMessage(e))
      setSaving(false)
    }
  }

  if (pattern) {
    const hints = pattern.charts ?? []
    return (
      <>
        <PageHeader
          title="Vérifier les étapes"
          description={[`Taille ${readSize(pattern)}`, `${pattern.steps.length} étapes`, pattern.gauge && formatGauge(pattern.gauge) && `échantillon ${formatGauge(pattern.gauge)}`].filter(Boolean).join(' · ')}
        />
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="knit-title">Nom du projet</Label>
            <Input id="knit-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          {pattern.sizeChart && pdf && (
            <SizeAdvice chart={pattern.sizeChart} sizes={pattern.sizes} readIndex={pattern.sizeIndex ?? null} rereading={reading} onReread={(s) => void readFor(pdf, s)} />
          )}
          <SizePicker id="knit-size-index" sizes={pattern.sizes} sizeIndex={sizeIndex} onChange={setSizeIndex} />
          <ol aria-label="Étapes lues" className="space-y-2">
            {pattern.steps.map((step, index) => (
              <li key={index} className="rounded-2xl border bg-background p-4 shadow-xs">
                <p className="font-medium">
                  {index + 1}. {step.title}
                </p>
                {step.instructions && <SizedText text={step.instructions} sizes={pattern.sizes} sizeIndex={sizeIndex} glossary={mergeGlossary(pattern.abbreviations ?? [], glossary, looksEnglish(step.instructions))} className="mt-1" />}
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
                {hints.some((h) => h.step === index) && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Grid3x3 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    Diagramme : {hints.filter((h) => h.step === index).map(describeHint).join(' ; ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {hints.some((h) => h.step === null) && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Grid3x3 className="mt-0.5 size-4 shrink-0" aria-hidden />
              Autres diagrammes repérés : {hints.filter((h) => h.step === null).map(describeHint).join(' ; ')}
            </p>
          )}
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

  // Patron mis de côté : son PDF est repris, il n'y a rien à choisir.
  const fromQueue = queuedId !== null
  const pdfField = (
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
  )
  const queuedPdf = (
    <div className="grid gap-1.5 text-sm">
      <p className="font-medium">Patron (PDF)</p>
      {pdf ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText className="size-4" aria-hidden /> {pdf.name}
          </span>
          <button type="button" className="font-medium text-brand underline-offset-4 hover:underline" onClick={() => setChangingPdf(true)}>
            Choisir un autre PDF
          </button>
        </p>
      ) : (
        !error && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Récupération du PDF mis de côté…
          </p>
        )
      )}
    </div>
  )

  return (
    <>
      <Link to="/tricot" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> Tricot
      </Link>
      <PageHeader
        title={fromQueue ? `Commencer « ${queued?.title ?? '…'} »` : 'Nouveau patron'}
        description={
          mode === 'later'
            ? 'Garde-le ici ; « Commencer » le découpera en étapes le moment venu.'
            : 'Le patron est découpé en étapes ; son texte est gardé tel quel, avec les nombres de ta taille mis en valeur.'
        }
      />
      {!fromQueue && (
        <div role="radiogroup" aria-label="Que faire de ce patron ?" className="mb-4 grid max-w-lg grid-cols-2 gap-2">
          {(
            [
              { value: 'start', label: 'Commencer maintenant', icon: Play },
              { value: 'later', label: 'Mettre de côté', icon: BookmarkPlus },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                mode === option.value ? 'border-brand bg-brand/10 text-foreground' : 'bg-background text-muted-foreground hover:bg-muted/50',
              )}
            >
              <option.icon className="size-4" aria-hidden /> {option.label}
            </button>
          ))}
        </div>
      )}
      {mode === 'later' ? (
        <QueueForm pdf={pdf} onPdf={setPdf} size={size} onSize={setSize} />
      ) : (
        <form onSubmit={(e) => void read(e)} className="max-w-lg space-y-4" noValidate>
          {fromQueue && !changingPdf ? queuedPdf : pdfField}
          <div className="grid gap-1.5">
            <Label htmlFor="knit-size">Taille choisie</Label>
            <Input id="knit-size" className="h-10 w-40" value={size} onChange={(e) => setSize(e.target.value)} maxLength={40} placeholder="M, 38, 4 ans…" aria-describedby="knit-size-hint" />
            <p id="knit-size-hint" className="text-xs text-muted-foreground">
              Facultatif : sans taille, les rangs et mailles comptés sont ceux de la première taille du patron. Tu pourras changer la taille mise en valeur.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-10" disabled={reading || (fromQueue && !pdf)}>
            {reading && <Loader2 className="animate-spin" aria-hidden />}
            {reading ? 'Lecture du patron…' : 'Lire le patron'}
          </Button>
          {reading && <p className="text-sm text-muted-foreground">Ça peut prendre jusqu’à 2 minutes pour un long patron.</p>}
        </form>
      )}
    </>
  )
}

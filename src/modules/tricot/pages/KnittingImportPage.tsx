import { FileText, Grid3x3, Loader2, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/PageHeader'
import { BackLink } from '../components/BackLink'
import { Note } from '../components/Note'
import { SizedText, SizePicker } from '../components/SizedText'
import { SizeAdvice } from '../components/SizeAdvice'
import { describeHint } from '../lib/chart'
import { useBaseGlossary } from '../hooks/useBaseGlossary'
import { looksEnglish, mergeGlossary } from '../lib/glossary'
import { sizeIndexOf } from '../lib/sizes'
import { describeSection, MAX_PDF_BYTES, stepFacts, type ReadPattern } from '../lib/pattern'
import { formatGauge } from '../lib/yarn'
import type { KnitPattern } from '../lib/library'

/**
 * Nouveau projet : PDF du patron (+ taille, facultative) → étapes lues par le modèle, vérifiées puis enregistrées. Le
 * patron est rangé dans la bibliothèque.
 * `?patron=<id>` : projet d'après un patron de la bibliothèque (son PDF et sa taille sont repris ; sans PDF, il est demandé).
 * `?plus-tard` (ancienne adresse de « Mettre de côté ») : ajout d'un patron à la bibliothèque.
 */
export function KnittingImportPage() {
  const api = useApi()
  const glossary = useBaseGlossary()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sourceId = params.get('patron')
  const [source, setSource] = useState<KnitPattern | null>(null)
  /** Patron de la bibliothèque : PDF repris ; « Choisir un autre PDF » le remplace pour ce projet. */
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
    if (!sourceId) return
    let active = true
    void (async () => {
      try {
        const item = await api.knitting.getPattern(sourceId)
        if (!active) return
        if (!item) return setError('Patron introuvable.')
        setSource(item)
        setSize((current) => current || item.size || '')
        // Sans PDF (photos ou lien seulement) : il est demandé ci-dessous.
        if (!item.pdfPath) return setChangingPdf(true)
        const file = await api.knitting.downloadPdf(item.pdfPath, item.title)
        if (active) setPdf(file)
      } catch (e) {
        if (active) setError(errorMessage(e))
      }
    })()
    return () => {
      active = false
    }
  }, [api, sourceId])

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
      setTitle((current) => (pattern && current.trim() && current !== pattern.title ? current : (source?.title ?? read.title)))
      setPattern(read)
      setSizeIndex(read.sizeIndex ?? sizeIndexOf(read.sizes, chosenSize))
    } catch (e) {
      if (pattern) toast.error(errorMessage(e))
      else setError(errorMessage(e))
    } finally {
      setReading(false)
    }
  }

  /** Taille du projet : celle choisie dans la liste du patron, sinon celle indiquée, sinon celle prise par la lecture. */
  function readSize(read: ReadPattern): string {
    return (sizeIndex !== null ? read.sizes[sizeIndex] : undefined) || size.trim() || (read.sizeIndex !== null && read.sizeIndex !== undefined ? read.sizes[read.sizeIndex] : undefined) || 'Unique'
  }

  async function save() {
    if (!pattern) return
    setSaving(true)
    try {
      const id = await api.knitting.createProject({ title: title.trim() || pattern.title, size: readSize(pattern), pdf, steps: pattern.steps, gauge: pattern.gauge ?? null, pattern: source && { id: source.id, pdfPath: changingPdf ? null : source.pdfPath }, chartHints: pattern.charts ?? [], sizes: pattern.sizes, sizeIndex, abbreviations: pattern.abbreviations ?? [], needles: pattern.needles ?? [] })
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
          description={[pattern.sizes.length < 2 && `Taille ${readSize(pattern)}`, `${pattern.steps.length} étapes`, pattern.gauge && formatGauge(pattern.gauge) && `échantillon ${formatGauge(pattern.gauge)}`].filter(Boolean).join(' · ')}
        />
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="knit-title">Nom du projet</Label>
            <Input id="knit-title" className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          {!!pattern.missingParts?.length && (
            <Note kind="todo" role="alert">
              <p>
                La lecture s’est arrêtée en route : {pattern.missingParts.length > 1 ? 'parties pas lues' : 'partie pas lue'} {pattern.missingParts.map((p) => `« ${p} »`).join(', ')}.
              </p>
              {pdf && (
                <Button variant="outline" className="h-10" disabled={reading} onClick={() => void readFor(pdf, size.trim())}>
                  <RotateCcw /> {reading ? 'Lecture…' : 'Relire le patron'}
                </Button>
              )}
            </Note>
          )}
          {pattern.sizeChart && pdf && (
            <SizeAdvice chart={pattern.sizeChart} sizes={pattern.sizes} readIndex={pattern.sizeIndex ?? null} rereading={reading} onReread={(s) => void readFor(pdf, s)} />
          )}
          <SizePicker id="knit-size-index" sizes={pattern.sizes} sizeIndex={sizeIndex} fallback={size.trim() || undefined} onChange={setSizeIndex} />
          <ol aria-label="Étapes lues" className="space-y-2">
            {pattern.steps.map((step, index) => (
              <li key={index} className="rounded-2xl border bg-background p-4 shadow-xs">
                <p className="font-medium">
                  {index + 1}. {step.title}
                </p>
                {step.instructions && <SizedText text={step.instructions} sizes={pattern.sizes} sizeIndex={sizeIndex} glossary={mergeGlossary(pattern.abbreviations ?? [], glossary, looksEnglish(step.instructions))} className="mt-1" />}
                {stepFacts(step).length > 0 && <p className="mt-2 text-xs text-muted-foreground">{stepFacts(step).join(' · ')}</p>}
                {step.sections.length > 0 && (
                  <ol aria-label="Sous-étapes" className="mt-2 list-inside list-decimal space-y-0.5 text-xs">
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

  if (params.has('plus-tard') && !sourceId) return <Navigate to="/tricot/patrons/nouveau" replace />

  // Patron de la bibliothèque : son PDF est repris, il n'y a rien à choisir.
  const fromLibrary = sourceId !== null
  const pdfField = (
    <div className="grid gap-1.5">
      <Label htmlFor="knit-pdf">Patron (PDF)</Label>
      <Input
        id="knit-pdf"
        type="file"
        accept="application/pdf,.pdf"
        className="h-10"
        onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
      />
      {pdf && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <FileText className="size-4" aria-hidden /> {pdf.name}
        </p>
      )}
    </div>
  )
  const libraryPdf = (
    <div className="grid gap-1.5 text-sm">
      <p className="font-medium">Patron (PDF)</p>
      {pdf ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText className="size-4" aria-hidden /> {pdf.name}
          </span>
          <button type="button" className="font-medium text-brand underline-offset-4 hover:underline" onClick={() => {
              setChangingPdf(true)
              setPdf(null)
            }}
          >
            Choisir un autre PDF
          </button>
        </p>
      ) : (
        !error && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Récupération du PDF du patron…
          </p>
        )
      )}
    </div>
  )

  return (
    <>
      <BackLink to={fromLibrary ? `/tricot/patrons/${sourceId}` : '/tricot'}>{fromLibrary ? 'Patron' : 'Tricot'}</BackLink>
      <PageHeader
        title={fromLibrary ? `Commencer « ${source?.title ?? '…'} »` : 'Nouveau projet'}
        description="Le patron est découpé en étapes ; son texte est gardé tel quel, avec les nombres de ta taille mis en valeur."
      />
      <form onSubmit={(e) => void read(e)} className="max-w-lg space-y-4" noValidate>
        {fromLibrary && !changingPdf ? libraryPdf : pdfField}
        <div className="grid gap-1.5">
          <Label htmlFor="knit-size">Taille</Label>
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
        <Button type="submit" className="h-10" disabled={reading || (fromLibrary && !pdf)}>
          {reading && <Loader2 className="animate-spin" aria-hidden />}
          {reading ? 'Lecture du patron…' : 'Lire le patron'}
        </Button>
        {reading && <p className="text-sm text-muted-foreground">Ça peut prendre jusqu’à 2 minutes pour un long patron.</p>}
      </form>
    </>
  )
}

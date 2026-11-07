import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openPdf, type OpenedPdf } from '@/lib/pdf'
import { CHART_MAX_SIDE, type ChartHint } from '../lib/chart'

/** Côté long des vignettes : assez pour reconnaître une grille. */
const THUMB_SIDE = 360
/** Au-delà, les pages restent choisissables par leur numéro, sans vignette. */
const MAX_THUMBS = 60

interface Props {
  /** Télécharge le PDF du patron. */
  load: () => Promise<Blob>
  /** Diagrammes repérés à la lecture du patron : leurs pages sont signalées. */
  hints: ChartHint[]
  onCancel: () => void
  /** Page choisie, rendue en image nette (à recadrer ensuite). */
  onPick: (image: File, page: number) => void
}

/** Choix de la page du PDF du patron où se trouve le diagramme. */
export function PdfPagePicker({ load, hints, onCancel, onPick }: Props) {
  const [pdf, setPdf] = useState<OpenedPdf | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<number | null>(null)
  const loadRef = useRef(load)

  // Ouverture du PDF, puis vignettes page après page ; tout est libéré à la fermeture.
  useEffect(() => {
    let cancelled = false
    let opened: OpenedPdf | null = null
    const urls: string[] = []
    ;(async () => {
      try {
        const doc = await openPdf(await loadRef.current())
        // Fenêtre déjà fermée pendant l'ouverture : le PDF est refermé tout de suite.
        if (cancelled) return void doc.close()
        opened = doc
        setPdf(doc)
        for (let page = 1; page <= Math.min(doc.pageCount, MAX_THUMBS) && !cancelled; page++) {
          const url = URL.createObjectURL(await doc.renderPage(page, THUMB_SIDE))
          urls.push(url)
          if (!cancelled) setThumbs([...urls])
        }
      } catch {
        if (!cancelled) setError('Le PDF du patron n’a pas pu être ouvert.')
      }
    })()
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
      void opened?.close()
    }
  }, [])

  async function pick(page: number) {
    if (!pdf) return
    setPicking(page)
    try {
      onPick(await pdf.renderPage(page, CHART_MAX_SIDE), page)
    } catch {
      setError('Cette page n’a pas pu être affichée.')
      setPicking(null)
    }
  }

  const pages = pdf ? Array.from({ length: pdf.pageCount }, (_, i) => i + 1) : []
  return (
    <Dialog open onOpenChange={(open) => !open && picking === null && onCancel()}>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Page du diagramme</DialogTitle>
          <DialogDescription>
            Choisis la page du patron où se trouve le diagramme ; tu le recadreras ensuite.{hints.length > 0 && ' Les diagrammes repérés à la lecture du patron sont signalés.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!pdf && !error && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Ouverture du PDF" />
          </div>
        )}
        {pdf && (
          <ul aria-label="Pages du patron" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((page) => (
              <li key={page}>
                <button
                  type="button"
                  disabled={picking !== null}
                  onClick={() => void pick(page)}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border bg-background p-2 text-sm hover:border-brand focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
                >
                  <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md bg-white">
                    {thumbs[page - 1] ? (
                      <img src={thumbs[page - 1]} alt="" className="max-h-full max-w-full" />
                    ) : picking === page || page <= MAX_THUMBS ? (
                      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    {picking === page && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    Page {page}
                  </span>
                  {hints.some((h) => h.page === page) && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {hints
                        .filter((h) => h.page === page)
                        .map((h) => h.title || 'Diagramme')
                        .join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" onClick={onCancel} disabled={picking !== null}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

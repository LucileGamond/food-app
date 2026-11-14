import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LoadError } from '@/components/LoadError'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openPdf } from '@/lib/pdf'

/** Côté long d'une page : lisible sur téléphone, en zoomant au besoin. */
const PAGE_SIDE = 1600
/** Au-delà, le PDF s'ouvre plutôt dans le navigateur (`onOpenOutside`). */
const MAX_PAGES = 60

interface Props {
  title: string
  /** Télécharge le PDF. */
  load: () => Promise<Blob>
  onClose: () => void
  /** Ouvre le PDF dans le navigateur (très long, ou illisible ici). */
  onOpenOutside: () => void
}

/** PDF lu dans l'application, page après page (sans quitter l'app, ce qu'un nouvel onglet fait sur téléphone). */
export function PdfReader({ title, load, onClose, onOpenOutside }: Props) {
  const [pages, setPages] = useState<string[]>([])
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Changé par « Réessayer » : le PDF est rouvert. */
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)

  // Ouverture, puis pages une à une ; tout est libéré à la fermeture.
  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    ;(async () => {
      let doc: Awaited<ReturnType<typeof openPdf>> | null = null
      try {
        doc = await openPdf(await loadRef.current())
        if (cancelled) return
        setPageCount(doc.pageCount)
        for (let page = 1; page <= Math.min(doc.pageCount, MAX_PAGES) && !cancelled; page++) {
          urls.push(URL.createObjectURL(await doc.renderPage(page, PAGE_SIDE)))
          if (!cancelled) setPages([...urls])
        }
      } catch {
        if (!cancelled) setError('Le PDF n’a pas pu être ouvert.')
      } finally {
        void doc?.close()
      }
    })()
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [attempt])

  function retry() {
    setError(null)
    setPages([])
    setPageCount(null)
    setAttempt((a) => a + 1)
  }

  const shown = pageCount === null ? 0 : Math.min(pageCount, MAX_PAGES)
  const outside = (
    <button type="button" className="underline underline-offset-2" onClick={onOpenOutside}>
      l’ouvrir dans le navigateur
    </button>
  )
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription>
            {pageCount === null ? 'Ouverture du PDF…' : `${pageCount} page${pageCount > 1 ? 's' : ''}`}
            {pageCount !== null && pageCount > MAX_PAGES && <> : les {MAX_PAGES} premières ici, ou {outside}.</>}
          </DialogDescription>
        </DialogHeader>
        {error && <LoadError message={error} onRetry={retry} />}
        {error && <p className="text-sm text-muted-foreground">Tu peux aussi {outside}.</p>}
        {!error && (pageCount === null || pages.length < shown) && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {pageCount === null ? 'Ouverture du PDF' : `Page ${pages.length + 1} sur ${shown}…`}
          </p>
        )}
        <ol aria-label="Pages du PDF" className="space-y-3">
          {pages.map((url, i) => (
            <li key={i}>
              <img src={url} alt={`Page ${i + 1}`} className="w-full rounded-md border bg-white" />
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

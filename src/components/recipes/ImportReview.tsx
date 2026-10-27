import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { CheckNote } from '@/components/recipes/CheckNote'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Props {
  /** Points à vérifier sur la recette en général (ceux d'un champ sont affichés sous le champ). */
  messages: string[]
  /** Photos lues (aperçus locaux), pour comparer avec le formulaire ; jamais enregistrées. */
  pages?: string[]
  onDismiss: () => void
}

/** Après un import : la photo lue, à comparer avec le formulaire, et ce qui est à vérifier sur la recette. */
export function ImportReview({ messages, pages = [], onDismiss }: Props) {
  const [viewing, setViewing] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)
  if (messages.length === 0 && pages.length === 0) return null

  return (
    <section aria-labelledby="import-review-title" className="rounded-2xl border bg-background p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="import-review-title" className="text-sm font-semibold">
            {pages.length > 1 ? 'Photos lues' : pages.length === 1 ? 'Photo lue' : 'À vérifier'}
          </h2>
          {pages.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">Compare avec le formulaire avant d’enregistrer.</p>}
        </div>
        <Button variant="ghost" size="icon" aria-label="Masquer" onClick={onDismiss}>
          <X />
        </Button>
      </div>

      {pages.length > 0 && (
        <ul className="mt-3 flex gap-3" aria-label="Photos lues">
          {pages.map((url, index) => (
            <li key={url}>
              <button
                type="button"
                onClick={() => {
                  setZoomed(false)
                  setViewing(index)
                }}
                className="block overflow-hidden rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <img src={url} alt={`Agrandir la page ${index + 1}`} className="h-40 w-30 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {messages.length > 0 && (
        <div className="mt-2">
          {messages.map((message) => (
            <CheckNote key={message} message={message} />
          ))}
        </div>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-3 sm:max-w-3xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 pr-8">
            <DialogTitle>Page {viewing === null ? '' : viewing + 1}</DialogTitle>
            <Button variant="outline" size="sm" onClick={() => setZoomed((z) => !z)}>
              {zoomed ? <ZoomOut /> : <ZoomIn />}
              {zoomed ? 'Réduire' : 'Agrandir'}
            </Button>
          </DialogHeader>
          <div className="max-h-[calc(100dvh-8rem)] overflow-auto rounded-lg border bg-muted">
            {viewing !== null && pages[viewing] && (
              <img src={pages[viewing]} alt={`Page ${viewing + 1} de la recette`} className={cn('max-w-none', zoomed ? 'w-[200%]' : 'w-full')} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

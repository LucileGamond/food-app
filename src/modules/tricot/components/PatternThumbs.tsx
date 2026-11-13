import { X } from 'lucide-react'

export interface Thumb {
  key: string
  /** Adresse de l'image (absente tant qu'elle se charge). */
  url: string | undefined
}

/** Vignettes des photos d'un patron : un toucher l'ouvre (`onOpen`), la croix la retire (`onRemove`). */
export function PatternThumbs({ thumbs, label, onOpen, onRemove }: { thumbs: Thumb[]; label: string; onOpen?: (index: number) => void; onRemove?: (index: number) => void }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {thumbs.map((thumb, i) => (
        <li key={thumb.key} className="relative size-20 overflow-hidden rounded-xl border bg-muted">
          {onOpen ? (
            <button type="button" className="size-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label={`Ouvrir la photo ${i + 1}`} onClick={() => onOpen(i)}>
              {thumb.url && <img src={thumb.url} alt="" className="size-full object-cover" />}
            </button>
          ) : (
            thumb.url && <img src={thumb.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Retirer la photo ${i + 1}`}
              onClick={() => onRemove(i)}
              className="absolute top-0.5 right-0.5 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

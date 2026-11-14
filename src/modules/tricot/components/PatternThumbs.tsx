import { ChevronLeft, Star, X } from 'lucide-react'

export interface Thumb {
  key: string
  /** Adresse de l'image (absente tant qu'elle se charge). */
  url: string | undefined
}

interface Props {
  thumbs: Thumb[]
  label: string
  /** Un toucher ouvre la photo. */
  onOpen?: (index: number) => void
  /** La croix retire la photo. */
  onRemove?: (index: number) => void
  /** Réordonner : la photo passe d'une place vers la gauche (`to` = index - 1), ou en couverture (`to` = 0). */
  onMove?: (from: number, to: number) => void
}

const SMALL_BUTTON =
  'absolute inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/** Vignettes des photos d'un patron ; la première est la couverture (vignette de la bibliothèque). */
export function PatternThumbs({ thumbs, label, onOpen, onRemove, onMove }: Props) {
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
          {onMove && thumbs.length > 1 && i === 0 && (
            <span className="absolute bottom-0 inset-x-0 bg-background/90 text-center text-[11px] font-medium">Couverture</span>
          )}
          {onMove && i > 0 && (
            <>
              {/* La 2e photo passe en couverture en avançant d'une place : un seul bouton suffit. */}
              {i > 1 && (
                <button type="button" aria-label={`Mettre la photo ${i + 1} en couverture`} onClick={() => onMove(i, 0)} className={`${SMALL_BUTTON} top-0.5 left-0.5`}>
                  <Star className="size-4" aria-hidden />
                </button>
              )}
              <button type="button" aria-label={`Avancer la photo ${i + 1}`} onClick={() => onMove(i, i - 1)} className={`${SMALL_BUTTON} bottom-0.5 left-0.5`}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            </>
          )}
          {onRemove && (
            <button type="button" aria-label={`Retirer la photo ${i + 1}`} onClick={() => onRemove(i)} className={`${SMALL_BUTTON} top-0.5 right-0.5`}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

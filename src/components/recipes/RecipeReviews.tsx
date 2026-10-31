import { Loader2, Star } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/api'
import { RATING_MAX, REVIEW_COMMENT_MAX, type RecipeReview } from '@/lib/recipes'
import { cn } from '@/lib/utils'

const STARS = Array.from({ length: RATING_MAX }, (_, i) => i + 1)

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} role="img" aria-label={`${rating} sur ${RATING_MAX}`}>
      {STARS.map((n) => (
        <Star key={n} className={cn('size-4', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} aria-hidden />
      ))}
    </span>
  )
}

interface Props {
  recipeId: string
  reviews: readonly RecipeReview[]
  onSaved: (reviews: RecipeReview[]) => void
}

/** Note et commentaire de chacun : les autres en lecture, le sien modifiable. */
export function RecipeReviews({ recipeId, reviews, onSaved }: Props) {
  const { profiles, currentProfile } = useAuth()
  const others = reviews.filter((r) => r.profileId !== currentProfile?.id)
  const name = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Quelqu’un'

  return (
    <section aria-labelledby="reviews-title" className="mt-8 rounded-2xl border bg-background p-5 shadow-xs">
      <h2 id="reviews-title" className="mb-4 font-semibold tracking-tight">
        Avis
      </h2>

      {others.length > 0 && (
        <ul className="mb-5 space-y-3">
          {others.map((review) => (
            <li key={review.profileId} className="text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{name(review.profileId)}</span>
                {review.rating !== null && <Stars rating={review.rating} />}
              </p>
              {review.comment && <p className="mt-1 whitespace-pre-line text-muted-foreground">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Profil connu après la fiche : l'éditeur part alors de son avis. */}
      {currentProfile && <MyReview key={currentProfile.id} profileId={currentProfile.id} recipeId={recipeId} reviews={reviews} onSaved={onSaved} />}
    </section>
  )
}

function MyReview({ profileId, recipeId, reviews, onSaved }: Props & { profileId: string }) {
  const api = useApi()
  const mine = reviews.find((r) => r.profileId === profileId)
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null)
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [saving, setSaving] = useState(false)
  const changed = rating !== (mine?.rating ?? null) || comment.trim() !== (mine?.comment ?? '')

  async function save() {
    setSaving(true)
    try {
      await api.recipes.saveReview(recipeId, { rating, comment })
      const text = comment.trim()
      const kept = reviews.filter((r) => r.profileId !== profileId)
      const removed = rating === null && !text
      onSaved(removed ? kept : [...kept, { profileId, rating, comment: text || null, updatedAt: new Date().toISOString() }])
      setComment(text)
      toast.success(removed ? 'Avis retiré' : 'Avis enregistré')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" id="my-rating">
          Ma note
        </span>
        <div className="flex" role="group" aria-labelledby="my-rating">
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} sur ${RATING_MAX}`}
              aria-pressed={rating === n}
              // Toucher la note déjà choisie la retire.
              onClick={() => setRating(rating === n ? null : n)}
              className="flex size-9 items-center justify-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Star className={cn('size-5', rating !== null && n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50')} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <Textarea
        aria-label="Mon commentaire"
        placeholder="Mon commentaire : « moins de sucre », « Eric adore »…"
        value={comment}
        maxLength={REVIEW_COMMENT_MAX}
        onChange={(e) => setComment(e.target.value)}
        className="bg-background"
      />
      <Button className="h-10 px-4" disabled={!changed || saving} onClick={() => void save()}>
        {saving && <Loader2 className="animate-spin" aria-hidden />} Enregistrer mon avis
      </Button>
    </div>
  )
}

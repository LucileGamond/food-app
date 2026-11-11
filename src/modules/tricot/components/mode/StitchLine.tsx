import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { StitchCount } from '../../lib/stitches'

/** « (?) » qui dit pourquoi le nombre n'est pas sûr. */
function Why({ reasons }: { reasons: string[] }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Pourquoi (?)"
            className="rounded px-0.5 font-medium text-brand underline decoration-dotted underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        (?)
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-1 text-sm">
        {reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        <p className="text-muted-foreground">À corriger dans la préparation de l’étape (mailles de chaque action).</p>
      </PopoverContent>
    </Popover>
  )
}

/** « En fin de rang : 82 mailles », « 82 (?) mailles » (estimation), « (?) mailles » (inconnu). */
export function StitchLine({ count }: { count: StitchCount }) {
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      En fin de rang :{' '}
      {count.kind === 'unknown' ? (
        <>
          <Why reasons={[count.reason]} /> mailles
        </>
      ) : (
        <span className="font-medium text-foreground">
          {count.stitches}
          {count.kind === 'estimate' && (
            <>
              {' '}
              <Why reasons={count.reasons} />
            </>
          )}{' '}
          maille{count.stitches > 1 ? 's' : ''}
        </span>
      )}
    </p>
  )
}

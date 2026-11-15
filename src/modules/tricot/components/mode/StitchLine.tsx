import { Link } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EditIcon } from '../KnitIcons'
import type { StitchCount } from '../../lib/stitches'

/** « (?) » qui dit pourquoi le nombre n'est pas sûr, avec le chemin pour le corriger. */
function Why({ reasons, fixTo }: { reasons: string[]; fixTo: string }) {
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
        <Link to={fixTo} className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4">
          <EditIcon className="size-4" aria-hidden /> Corriger la sous-étape
        </Link>
      </PopoverContent>
    </Popover>
  )
}

/** « En fin de rang : 82 mailles », « 82 (?) mailles » (estimation), « (?) mailles » (inconnu). */
export function StitchLine({ count, setupTo }: { count: StitchCount; setupTo: string }) {
  // La sous-étape à corriger s'ouvre dans la préparation (« sous-etape », compté à partir de 1).
  const fixTo = count.kind !== 'sure' && count.section !== undefined ? `${setupTo}${setupTo.includes('?') ? '&' : '?'}sous-etape=${count.section + 1}` : setupTo
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      En fin de rang :{' '}
      {count.kind === 'unknown' ? (
        <>
          <Why reasons={[count.reason]} fixTo={fixTo} /> mailles
        </>
      ) : (
        <span className="font-medium text-foreground">
          {count.stitches}
          {count.kind === 'estimate' && (
            <>
              {' '}
              <Why reasons={count.reasons} fixTo={fixTo} />
            </>
          )}{' '}
          maille{count.stitches > 1 ? 's' : ''}
        </span>
      )}
    </p>
  )
}

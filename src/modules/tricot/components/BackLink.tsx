import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BackIcon } from './KnitIcons'

interface Props {
  to: string
  children: ReactNode
  /** Saisie en cours, perdue en partant : on demande avant. */
  confirmLeave?: boolean
}

/** Retour à l'écran parent, au-dessus du titre (un nom long, celui d'un projet, est coupé). */
export function BackLink({ to, children, confirmLeave = false }: Props) {
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  return (
    <>
      <Link
        to={to}
        className="mb-2 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={(event) => {
          if (!confirmLeave) return
          event.preventDefault()
          setAsking(true)
        }}
      >
        <BackIcon className="size-4 shrink-0" aria-hidden /> <span className="truncate">{children}</span>
      </Link>
      {confirmLeave && (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title="Quitter sans enregistrer ?"
          description="Ce que tu as saisi sera perdu."
          confirmLabel="Quitter"
          onConfirm={async () => navigate(to)}
        />
      )}
    </>
  )
}

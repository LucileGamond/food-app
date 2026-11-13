import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  /** Actions de l'écran : à droite sur ordinateur, sous le titre sur téléphone. */
  actions?: ReactNode
  /** Action tenue au bout du titre, sur toutes les tailles d'écran (le menu « … » d'une page). */
  titleAction?: ReactNode
}

/** Titre d'un écran, avec sa description et ses actions (à droite sur ordinateur). */
export function PageHeader({ title, description, actions, titleAction }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{title}</h1>
          {titleAction && <div className="shrink-0">{titleAction}</div>}
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

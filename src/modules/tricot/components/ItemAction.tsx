import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TOUCH_AREA } from '../lib/touch'

/**
 * Action sur un élément (une laine, une fiche, un diagramme, le projet) : une petite icône seule, sans fond, en haut à
 * droite de l'élément. Règle des boutons du 2026-11-15 : au-delà de deux actions, un menu « … » ; Supprimer n'est
 * jamais un bouton à texte, c'est cette poubelle (ou le menu), toujours suivie d'une confirmation.
 */
export function ItemAction({ label, children, className, ...props }: { label: string; children: ReactNode } & Omit<ComponentProps<typeof Button>, 'variant' | 'size' | 'aria-label'>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} className={cn('relative [&_svg]:size-5', TOUCH_AREA, className)} {...props}>
      {children}
    </Button>
  )
}

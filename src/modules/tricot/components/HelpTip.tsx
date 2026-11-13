import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Aide repliée derrière un (?) : l'explication s'ouvre d'un toucher, au lieu de rester affichée. */
export function HelpTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Aide : ${label}`}
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              className,
            )}
          />
        }
      >
        <CircleHelp className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-1 text-sm">{children}</PopoverContent>
    </Popover>
  )
}

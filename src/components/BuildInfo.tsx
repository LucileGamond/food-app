import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Version installée : « 1414f25 · 31 oct. 2026, 14:05 », ou rien en dehors d'un dépôt git. */
export function buildLabel(hash: string, date: string): string | null {
  if (!hash) return null
  const time = new Date(date)
  return Number.isNaN(time.getTime()) ? hash : `${hash} · ${DATE_FORMAT.format(time)}`
}

/** Petit « i » : numéro et heure du dernier commit de la version installée. */
export function BuildInfo({ size = 'icon' }: { size?: 'icon' | 'icon-lg' }) {
  const label = buildLabel(import.meta.env.VITE_COMMIT_HASH ?? '', import.meta.env.VITE_COMMIT_DATE ?? '')
  if (!label) return null
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size={size} aria-label="Version de l’application" />}>
        <Info />
      </PopoverTrigger>
      <PopoverContent className="w-auto text-sm">
        <p className="font-medium">Dernier commit</p>
        <p className="text-muted-foreground">{label}</p>
      </PopoverContent>
    </Popover>
  )
}

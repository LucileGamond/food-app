import { Sprout } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Photo de la plante, ou pictogramme si elle n'en a pas. */
export function PlantThumb({ url, name, className }: { url: string | undefined; name: string; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-brand-soft', className)}>
      {url ? <img src={url} alt={name} className="size-full object-cover" loading="lazy" /> : <Sprout className="size-1/3 min-h-5 min-w-5 text-brand" aria-hidden />}
    </div>
  )
}

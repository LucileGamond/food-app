import { MessageCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Bulle d'un article de courses : les lignes de recette d'où il vient. Rien pour un article ajouté à la main. */
export function ItemSources({ name, sources }: { name: string; sources?: readonly string[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`D’où vient « ${name} »`}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <MessageCircle className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="font-medium">{name}</p>
        <ul className="mt-1 space-y-1 text-muted-foreground">
          {sources.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { patternFacts, patternFormats, type KnitPattern } from '../lib/library'

/** Patrons de la bibliothèque : un toucher ouvre la fiche. */
export function PatternList({ items }: { items: KnitPattern[] }) {
  return (
    <ul aria-label="Patrons" className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="rounded-2xl border bg-background shadow-xs transition-colors hover:bg-muted/50">
          <Link to={`/tricot/patrons/${p.id}`} className="flex items-center gap-3 rounded-2xl p-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.title}</span>
              {patternFacts(p).length > 0 && <span className="block truncate text-sm text-muted-foreground">{patternFacts(p).join(' · ')}</span>}
              <span className="block truncate text-xs text-muted-foreground">{patternFormats(p).join(' · ')}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}

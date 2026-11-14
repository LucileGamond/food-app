import { FileText, Link2 } from 'lucide-react'
import { OpenIcon } from './KnitIcons'
import { Link } from 'react-router-dom'
import { useApi } from '@/app/ApiContext'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { KnitCover } from './KnitCover'
import { patternFacts, patternFormats, type KnitPattern } from '../lib/library'

/** Patrons de la bibliothèque, une ligne compacte chacun (vignette, nom, ce qu'on en sait) : un toucher ouvre la fiche. */
export function PatternList({ items }: { items: KnitPattern[] }) {
  const api = useApi()
  const urls = useSignedUrls(
    api.knitting.progressPhotoUrls,
    items.flatMap((p) => p.photos.slice(0, 1)),
  )
  return (
    <ul aria-label="Patrons" className="space-y-2">
      {items.map((p) => {
        const cover = p.photos[0] ? urls[p.photos[0]] : undefined
        const Icon = p.pdfPath ? FileText : Link2
        return (
          <li key={p.id} className="rounded-2xl border bg-background shadow-xs transition-colors hover:bg-muted/50">
            <Link to={`/tricot/patrons/${p.id}`} className="flex items-center gap-3 rounded-2xl p-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted" aria-hidden>
                {cover ? (
                  <img src={cover} alt="" className="size-full object-cover" />
                ) : (
                  !p.photos[0] && (
                    <>
                      {/* Sans photo : couverture tricotée propre au patron, et le format (PDF ou lien) en coin. */}
                      <KnitCover id={p.id} className="size-full" />
                      <small className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded bg-background/90">
                        <Icon className="size-3 text-muted-foreground" />
                      </small>
                    </>
                  )
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate knit-name">{p.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{[...patternFacts(p), ...patternFormats(p)].join(' · ')}</span>
              </span>
              <OpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

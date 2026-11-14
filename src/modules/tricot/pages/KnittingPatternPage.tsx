import { ChevronRight, ExternalLink, FileText, MoreHorizontal, Pencil, Play, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { LoadError } from '@/components/LoadError'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { openInNewTab } from '@/lib/openInNewTab'
import { cn } from '@/lib/utils'
import { BackLink } from '../components/BackLink'
import { PatternThumbs } from '../components/PatternThumbs'
import { patternFacts, type KnitPattern } from '../lib/library'

/** Fiche d'un patron : ses formats à ouvrir, ce qu'on en sait, ses projets, et « Commencer un projet ». */
export function KnittingPatternPage() {
  const { id = '' } = useParams()
  const api = useApi()
  const pattern = useAsync(() => api.knitting.getPattern(id), [api, id])

  if (pattern.error) return <LoadError message={pattern.error} onRetry={pattern.reload} />
  if (pattern.data === undefined)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement du patron">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  if (pattern.data === null)
    return (
      <>
        <BackLink to="/tricot/patrons">Bibliothèque</BackLink>
        <EmptyState icon={SearchX} title="Patron introuvable" description="Il a peut-être été supprimé." />
      </>
    )
  return <PatternSheet pattern={pattern.data} />
}

function PatternSheet({ pattern }: { pattern: KnitPattern }) {
  const api = useApi()
  const navigate = useNavigate()
  const photoUrls = useSignedUrls(api.knitting.progressPhotoUrls, pattern.photos)
  // Photo ouverte ; l'index reste pendant la fermeture, pour que le titre ne change pas.
  const [viewing, setViewing] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const facts = patternFacts(pattern)

  async function openPdf() {
    await openInNewTab(() => api.knitting.pdfUrl(pattern.pdfPath!)).catch((error: unknown) => toast.error(errorMessage(error)))
  }

  async function remove() {
    try {
      await api.knitting.deletePattern(pattern)
      toast.success('Patron supprimé')
      navigate('/tricot/patrons', { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <article>
      <BackLink to="/tricot/patrons">Bibliothèque</BackLink>
      <div className="mb-6 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{pattern.title}</h1>
          {facts.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{facts.join(' · ')}</p>}
        </div>
        <Link to={`/tricot/patrons/${pattern.id}/modifier`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
          <Pencil /> Modifier
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" className="size-10" aria-label="Plus d’actions" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="max-w-lg space-y-6">
        <section aria-label="Le patron" className="space-y-3">
          {(pattern.pdfPath || pattern.url) && (
            <div className="flex flex-wrap gap-2">
              {pattern.pdfPath && (
                <Button variant="outline" className="h-10" onClick={() => void openPdf()}>
                  <FileText /> Ouvrir le PDF
                </Button>
              )}
              {pattern.url && (
                <a href={pattern.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
                  <ExternalLink /> Ouvrir le lien
                </a>
              )}
            </div>
          )}
          {pattern.photos.length > 0 && <PatternThumbs label="Photos du patron" thumbs={pattern.photos.map((path) => ({ key: path, url: photoUrls[path] }))} onOpen={(i) => {
                setViewing(i)
                setViewerOpen(true)
              }}
            />}
          {pattern.notes && <p className="text-sm whitespace-pre-line">{pattern.notes}</p>}
        </section>

        <section aria-labelledby="pattern-projects" className="space-y-3">
          <h2 id="pattern-projects" className="text-lg font-semibold">
            Projets
          </h2>
          {pattern.projects.length > 0 ? (
            <ul aria-label="Projets de ce patron" className="space-y-2">
              {pattern.projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/tricot/${p.id}`} className="flex items-center gap-3 rounded-2xl border bg-background p-3 shadow-xs hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-sm text-muted-foreground">Taille {p.size}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Pas encore tricoté.</p>
          )}
          <Link to={`/tricot/nouveau?patron=${pattern.id}`} className={cn(buttonVariants(), 'h-10')}>
            <Play /> Commencer un projet
          </Link>
          {pattern.readSizes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Déjà lu pour {pattern.readSizes.length > 1 ? 'les tailles' : 'la taille'} {pattern.readSizes.join(', ')} : un projet dans {pattern.readSizes.length > 1 ? 'ces tailles' : 'cette taille'} se crée sans
              relire le patron.
            </p>
          )}
          {!pattern.pdfPath && <p className="text-xs text-muted-foreground">Le projet se crée à partir du PDF du patron : il te sera demandé.</p>}
        </section>
      </div>

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>
            Photo {viewing + 1} sur {pattern.photos.length}
          </DialogTitle>
          {photoUrls[pattern.photos[viewing]!] && (
            <img src={photoUrls[pattern.photos[viewing]!]} alt={`Photo ${viewing + 1} du patron`} className="max-h-[70dvh] w-full rounded-xl object-contain" />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer ce patron ?"
        description={pattern.projects.length > 0 ? 'Il quitte la bibliothèque ; ses projets restent, avec leur PDF.' : 'Il quitte la bibliothèque, avec ses fichiers.'}
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </article>
  )
}

// Stock de laine (page Tricot) : pelotes à la maison, et « Quel patron ? » pour chacune — d'abord parmi les patrons
// mis de côté (métrage et aiguilles comparés dans l'application), puis des idées du modèle si besoin.

import { ExternalLink, Loader2, Pencil, Play, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError } from '@/components/LoadError'
import { useAsync } from '@/hooks/useAsync'
import { cn } from '@/lib/utils'
import { matchPatterns, patternSearchUrl, siteOf, yarnDetails, yarnMeters, yarnTitle, type QueuedPattern, type StashItem, type Yarn, type YarnIdea } from '../lib/yarn'
import { Fold } from './Fold'
import { YarnDialog } from './YarnPanel'

function PatternLink({ item }: { item: QueuedPattern }) {
  if (item.pdfPath) {
    return (
      <Link to={`/tricot/nouveau?patron=${item.id}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-10')} aria-label={`Commencer ${item.title}`}>
        <Play /> Commencer
      </Link>
    )
  }
  return item.url ? (
    <a href={item.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
      <ExternalLink /> Lien
    </a>
  ) : null
}

/** « Quel patron pour cette laine ? » : patrons mis de côté qui conviennent, puis idées du modèle. */
function MatchDialog({ item, queue, onOpenChange }: { item: StashItem | null; queue: QueuedPattern[]; onOpenChange: (open: boolean) => void }) {
  const api = useApi()
  const [ideas, setIdeas] = useState<YarnIdea[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const yarn = item?.yarn
  const { fits, unknown } = yarn ? matchPatterns(yarn, queue) : { fits: [], unknown: [] }
  const meters = yarn ? yarnMeters(yarn) : null

  async function askIdeas(target: Yarn) {
    setLoading(true)
    setError(null)
    try {
      setIdeas(await api.knitting.yarnIdeas(target))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (open) return
        onOpenChange(false)
        setIdeas(null)
        setError(null)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quel patron pour cette laine ?</DialogTitle>
          <DialogDescription>
            {yarn && [yarnTitle(yarn), meters !== null ? `${meters} m en stock` : 'métrage en stock inconnu'].join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="match-mine" className="space-y-2">
          <h3 id="match-mine" className="text-sm font-medium">
            Dans tes patrons à faire plus tard
          </h3>
          {fits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {queue.length === 0 ? 'Aucun patron mis de côté.' : 'Aucun ne convient d’après le métrage et les aiguilles.'}
            </p>
          ) : (
            <ul aria-label="Patrons qui conviennent" className="space-y-2">
              {fits.map(({ item: pattern, reasons }) => (
                <li key={pattern.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{pattern.title}</span>
                    <span className="text-muted-foreground">{reasons.join(' · ')}</span>
                  </p>
                  <PatternLink item={pattern} />
                </li>
              ))}
            </ul>
          )}
          {unknown.length > 0 && (
            <p className="text-xs text-muted-foreground">
              À vérifier (métrage ou aiguilles non notés) : {unknown.map((p) => p.title).join(', ')}.
            </p>
          )}
        </section>

        <section aria-labelledby="match-ideas" className="space-y-2">
          <h3 id="match-ideas" className="text-sm font-medium">
            Des idées
          </h3>
          {ideas === null ? (
            <Button variant={fits.length === 0 ? 'default' : 'outline'} className="h-10" disabled={loading || !yarn} onClick={() => yarn && void askIdeas(yarn)}>
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles />}
              {loading ? 'Recherche d’idées…' : 'Des idées avec l’IA'}
            </Button>
          ) : (
            <ul aria-label="Idées de modèles" className="space-y-2">
              {ideas.map((idea) => (
                <li key={idea.title} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">{idea.title}</p>
                  <p className="text-muted-foreground">
                    {[idea.why, idea.meters !== null && `≈ ${idea.meters} m`, idea.needleMm !== null && `aiguilles ${String(idea.needleMm).replace('.', ',')} mm`].filter(Boolean).join(' · ')}
                  </p>
                  {idea.patterns.length > 0 && (
                    <ul aria-label={`Patrons trouvés : ${idea.title}`} className="mt-2 space-y-1">
                      {idea.patterns.map((p) => (
                        <li key={p.url}>
                          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 font-medium text-brand underline-offset-4 hover:underline">
                            <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span>
                              {p.title} <span className="font-normal text-muted-foreground">· {siteOf(p.url)}</span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {idea.search && (
                    <a
                      href={patternSearchUrl(idea.search, { weight: idea.weight, meters, needleMm: yarn?.needle_mm ?? null })}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="size-3.5" aria-hidden /> Plus de patrons sur Ravelry
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}

export function StashSection({ queue }: { queue: QueuedPattern[] }) {
  const api = useApi()
  const stash = useAsync(() => api.knitting.listStash(), [api])
  const [editing, setEditing] = useState<StashItem | 'new' | null>(null)
  const [removing, setRemoving] = useState<StashItem | null>(null)
  const [matching, setMatching] = useState<StashItem | null>(null)
  // Replié par défaut ; ouvert après un ajout pour voir la laine ajoutée.
  const [open, setOpen] = useState(false)
  const count = stash.data?.length ?? 0

  async function save(yarn: Yarn): Promise<boolean> {
    try {
      await api.knitting.saveStashItem({ id: editing && editing !== 'new' ? editing.id : null, yarn, notes: editing && editing !== 'new' ? editing.notes : '' })
      stash.reload()
      setOpen(true)
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  async function remove() {
    if (!removing) return
    try {
      await api.knitting.deleteStashItem(removing.id)
      toast.success('Laine retirée du stock')
      stash.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Fold
      id="knit-stash"
      variant="section"
      className="mt-8"
      title="Stock de laine"
      open={open}
      onToggle={() => setOpen((o) => !o)}
      summary={count > 0 ? `${count} laine${count > 1 ? 's' : ''}` : 'vide'}
      action={
        <Button variant="outline" className="h-10" onClick={() => setEditing('new')}>
          <Plus /> Ajouter au stock
        </Button>
      }
    >
      <div>
        {stash.error ? (
          <LoadError message={stash.error} onRetry={stash.reload} />
        ) : !stash.data ? (
          <Skeleton className="h-16 rounded-2xl" aria-busy="true" aria-label="Chargement du stock de laine" />
        ) : stash.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune laine en stock : note tes pelotes (la photo de l’étiquette suffit) pour savoir quoi en faire.</p>
        ) : (
          <ul aria-label="Stock de laine" className="space-y-2">
            {stash.data.map((item) => (
              <li key={item.id} className="rounded-2xl border bg-background p-4 shadow-xs">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{yarnTitle(item.yarn)}</span>
                    <span className="text-muted-foreground">{yarnDetails(item.yarn)}</span>
                  </p>
                  <Button variant="ghost" size="icon-touch" aria-label={`Modifier ${yarnTitle(item.yarn)}`} onClick={() => setEditing(item)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-touch" aria-label={`Supprimer ${yarnTitle(item.yarn)} du stock`} onClick={() => setRemoving(item)}>
                    <Trash2 />
                  </Button>
                </div>
                <Button variant="outline" className="mt-3 h-10" onClick={() => setMatching(item)} aria-label={`Quel patron pour ${yarnTitle(item.yarn)} ?`}>
                  <Wand2 /> Quel patron ?
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <YarnDialog
        yarn={editing && editing !== 'new' ? editing.yarn : null}
        title={editing === 'new' ? 'Ajouter au stock' : undefined}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={save}
      />
      <MatchDialog item={matching} queue={queue} onOpenChange={() => setMatching(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette laine du stock ?"
        description="Elle n’apparaîtra plus dans le stock."
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </Fold>
  )
}

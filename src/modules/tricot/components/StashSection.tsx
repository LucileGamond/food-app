// Stock de laine (page Tricot) : pelotes à la maison, et « Quel patron ? » pour chacune — d'abord dans la bibliothèque
// de patrons (métrage et aiguilles comparés dans l'application), puis des idées du modèle si besoin (YarnIdeasSection).

import { Wand2 } from 'lucide-react'
import { AddIcon, DeleteIcon, EditIcon, OpenIcon } from './KnitIcons'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/PageHeader'
import { Loading } from './Loading'
import { LoadError } from '@/components/LoadError'
import { useAsync } from '@/hooks/useAsync'
import { YarnBand } from './YarnBand'
import { cn } from '@/lib/utils'
import { TOUCH_AREA } from '../lib/touch'
import { yarnMeters, yarnTitle, type StashItem, type Yarn } from '../lib/yarn'
import { matchPatterns, type KnitPattern } from '../lib/library'
import { YarnDialog } from './YarnPanel'
import { YarnIdeasSection } from './YarnIdeasSection'

/** « Quel patron pour cette laine ? » : patrons de la bibliothèque qui conviennent, puis idées du modèle. */
function MatchDialog({ item, stash, patterns, onOpenChange }: { item: StashItem | null; stash: StashItem[]; patterns: KnitPattern[]; onOpenChange: (open: boolean) => void }) {
  const yarn = item?.yarn
  const { fits, unknown } = yarn ? matchPatterns(yarn, patterns) : { fits: [], unknown: [] }
  const meters = yarn ? yarnMeters(yarn) : null

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => !open && onOpenChange(false)}
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
            Dans ta bibliothèque
          </h3>
          {fits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {patterns.length === 0 ? 'Aucun patron dans ta bibliothèque.' : 'Aucun ne convient d’après le métrage et les aiguilles.'}
            </p>
          ) : (
            <ul aria-label="Patrons qui conviennent" className="space-y-2">
              {fits.map(({ item: pattern, reasons }) => (
                <li key={pattern.id}>
                  <Link to={`/tricot/patrons/${pattern.id}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block knit-name">{pattern.title}</span>
                      <span className="text-muted-foreground">{reasons.join(' · ')}</span>
                    </span>
                    <OpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
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

        {item && <YarnIdeasSection key={item.id} item={item} stash={stash} emphasize={fits.length === 0} />}
      </DialogContent>
    </Dialog>
  )
}

export function StashSection({ patterns }: { patterns: KnitPattern[] }) {
  const api = useApi()
  const stash = useAsync(() => api.knitting.listStash(), [api])
  const [editing, setEditing] = useState<StashItem | 'new' | null>(null)
  const [removing, setRemoving] = useState<StashItem | null>(null)
  const [matching, setMatching] = useState<StashItem | null>(null)

  async function save(yarn: Yarn): Promise<boolean> {
    try {
      await api.knitting.saveStashItem({ id: editing && editing !== 'new' ? editing.id : null, yarn, notes: editing && editing !== 'new' ? editing.notes : '' })
      stash.reload()
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
    <>
      <PageHeader
        title="Stock de laine"
        description="Tes pelotes, et les patrons qui leur conviennent."
        actions={
          <Button className="h-10 px-4" onClick={() => setEditing('new')}>
            <AddIcon /> Ajouter au stock
          </Button>
        }
      />
      <div>
        {stash.error ? (
          <LoadError message={stash.error} onRetry={stash.reload} />
        ) : !stash.data ? (
          <Loading label="Chargement du stock de laine" />
        ) : stash.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune laine en stock : note tes pelotes (la photo de l’étiquette suffit) pour savoir quoi en faire.</p>
        ) : (
          <ul aria-label="Stock de laine" className="space-y-2">
            {stash.data.map((item) => (
              <li key={item.id} className="rounded-2xl border bg-background p-4 shadow-xs">
                <YarnBand
                  yarn={item.yarn}
                  actions={
                    <>
                      <Button variant="ghost" size="icon-sm" className={cn('relative', TOUCH_AREA)} aria-label={`Modifier ${yarnTitle(item.yarn)}`} onClick={() => setEditing(item)}>
                        <EditIcon className="size-5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className={cn('relative', TOUCH_AREA)} aria-label={`Supprimer ${yarnTitle(item.yarn)} du stock`} onClick={() => setRemoving(item)}>
                        <DeleteIcon className="size-5" />
                      </Button>
                    </>
                  }
                />
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
      <MatchDialog item={matching} stash={stash.data ?? []} patterns={patterns} onOpenChange={() => setMatching(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette laine du stock ?"
        description="Elle n’apparaîtra plus dans le stock."
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </>
  )
}

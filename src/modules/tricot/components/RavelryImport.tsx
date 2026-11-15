// Bibliothèque de patrons : « Depuis Ravelry » — tes favoris et ta bibliothèque Ravelry deviennent des patrons de
// l'application (nom, créatrice, photo, métrage, aiguilles, laine, et le PDF acheté si Ravelry le permet). Gratuit,
// compte Ravelry relié ; les patrons déjà dans la bibliothèque sont sautés.

import { Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsync } from '@/hooks/useAsync'
import { compressImage } from '@/lib/image'
import { findDuplicates, importSourceText, pdfMissingText, ravelryImportFields, type KnitPattern, type RavelryImportItem } from '../lib/library'
import { DoneIcon, LinkIcon } from './KnitIcons'

type Status = { kind: 'waiting' } | { kind: 'saving' } | { kind: 'added'; note: string | null } | { kind: 'failed'; error: string }

interface Props {
  library: KnitPattern[]
  /** Fin de l'import : la bibliothèque est rechargée. */
  onDone: () => void
}

export function RavelryImport({ library, onDone }: Props) {
  const api = useApi()
  // Sans compte Ravelry relié (ou s'il est illisible), rien n'est proposé.
  const account = useAsync(() => api.knitting.getRavelryAccount(), [api])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<RavelryImportItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<number[]>([])
  const [status, setStatus] = useState<Record<number, Status>>({})
  const [running, setRunning] = useState(false)

  if (!account.data) return null

  const isKnown = (item: RavelryImportItem) => findDuplicates(library, { title: item.title, url: null }).length > 0

  async function show() {
    setOpen(true)
    setItems(null)
    setLoadError(null)
    setStatus({})
    try {
      const list = await api.knitting.listRavelryImports()
      setItems(list)
      // Tout ce qui n'est pas déjà dans la bibliothèque est coché d'office.
      setChosen(list.filter((item) => !isKnown(item)).map((item) => item.patternId))
    } catch (e) {
      setLoadError(errorMessage(e))
    }
  }

  async function run() {
    if (!items) return
    setRunning(true)
    const update = (id: number, s: Status) => setStatus((current) => ({ ...current, [id]: s }))
    const todo = items.filter((item) => chosen.includes(item.patternId))
    for (const item of todo) update(item.patternId, { kind: 'waiting' })
    // Un à la fois, comme l'ajout de plusieurs PDF.
    for (const item of todo) {
      update(item.patternId, { kind: 'saving' })
      try {
        const found = await api.knitting.importRavelryPattern(item)
        let photo: Blob | null = null
        try {
          photo = found.image ? await compressImage(found.image) : null
        } catch {
          // Photo illisible : le patron est ajouté sans.
        }
        await api.knitting.savePattern(ravelryImportFields(found), { pdfPath: null, newPdf: found.pdf, photos: photo ? [photo] : [] }, null)
        update(item.patternId, { kind: 'added', note: pdfMissingText(found.pdfMissing, item.volumeId !== null) })
      } catch (e) {
        update(item.patternId, { kind: 'failed', error: errorMessage(e) })
      }
    }
    setChosen([])
    setRunning(false)
  }

  function close() {
    if (running) return
    const added = Object.values(status).some((s) => s.kind === 'added')
    setOpen(false)
    if (added) onDone()
  }

  const done = Object.keys(status).length > 0 && !running
  const added = Object.values(status).filter((s) => s.kind === 'added').length
  const permissionMissing = Object.values(status).some((s) => s.kind === 'added' && s.note?.includes('permission'))

  return (
    <>
      <Button type="button" variant="outline" className="h-10" onClick={() => void show()}>
        <LinkIcon /> Depuis Ravelry
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer depuis Ravelry</DialogTitle>
            <DialogDescription>
              {done
                ? `${added} patron${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} à la bibliothèque.`
                : 'Tes favoris et ta bibliothèque Ravelry : nom, créatrice, photo, métrage, aiguilles et laine (gratuit).'}
            </DialogDescription>
          </DialogHeader>

          {loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : !items ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Lecture de tes patrons Ravelry…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun patron en favori ni dans ta bibliothèque Ravelry.</p>
          ) : (
            <ul aria-label="Patrons Ravelry" className="space-y-2">
              {items.map((item) => {
                const known = isKnown(item)
                const s = status[item.patternId]
                const id = `ravelry-import-${item.patternId}`
                return (
                  <li key={item.patternId} className="flex items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={chosen.includes(item.patternId)}
                      disabled={known || running || done}
                      onCheckedChange={(checked) => setChosen((list) => (checked === true ? [...list, item.patternId] : list.filter((p) => p !== item.patternId)))}
                    />
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="size-10 shrink-0 rounded-lg bg-muted" aria-hidden />
                    )}
                    <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                      <span className="knit-name block truncate">{item.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[item.author, importSourceText(item), known && 'déjà dans ta bibliothèque'].filter(Boolean).join(' · ')}
                      </span>
                      {s && <StatusLine status={s} />}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          {permissionMissing && (
            <p className="text-xs text-muted-foreground">
              Les PDF achetés n’ont pas pu être récupérés : il faut accorder à l’application la permission de télécharger ta bibliothèque sur Ravelry.
            </p>
          )}

          <DialogFooter>
            {done || !items || items.length === 0 ? (
              <Button type="button" className="h-10" onClick={close}>
                Fermer
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" className="h-10" disabled={running} onClick={close}>
                  Annuler
                </Button>
                <Button type="button" className="h-10" disabled={running || chosen.length === 0} onClick={() => void run()}>
                  {running && <Loader2 className="animate-spin" aria-hidden />}
                  {running ? 'Import en cours…' : `Importer (${chosen.length})`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'waiting') return <span className="block text-xs text-muted-foreground">en attente</span>
  if (status.kind === 'saving')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden /> import…
      </span>
    )
  if (status.kind === 'failed')
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <TriangleAlert className="size-3" aria-hidden /> {status.error}
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <DoneIcon className="size-3" aria-hidden /> {['ajouté', status.note].filter(Boolean).join(' ')}
    </span>
  )
}

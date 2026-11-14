import { Check, Files, Loader2, Minus, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { batchFields, planBatch, type KnitPattern } from '../lib/library'
import { MAX_PDF_BYTES } from '../lib/pattern'

type Status = 'waiting' | 'saving' | 'added' | 'too-large' | 'duplicate' | 'failed'

interface Row {
  key: string
  title: string
  status: Status
  error?: string
}

const STATUS_TEXT: Record<Exclude<Status, 'failed'>, string> = {
  waiting: 'en attente',
  saving: 'ajout…',
  added: 'ajouté',
  'too-large': 'trop lourd (20 Mo au plus), sauté',
  duplicate: 'déjà dans la bibliothèque, sauté',
}

interface Props {
  library: KnitPattern[]
  /** Fin de l'ajout : la bibliothèque est rechargée. */
  onDone: () => void
}

/** « Plusieurs PDF » : un patron par PDF choisi, nommé d'après le fichier ; doublons et fichiers trop lourds sautés. */
export function BatchPdfImport({ library, onDone }: Props) {
  const api = useApi()
  const input = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [running, setRunning] = useState(false)

  async function start(list: FileList | null) {
    const files = [...(list ?? [])]
    if (input.current) input.current.value = ''
    if (files.length === 0) return
    const plan = planBatch(files, library, MAX_PDF_BYTES)
    const initial: Row[] = plan.map((item, i) => ({ key: `${i}-${files[i]!.name}`, title: item.title, status: item.skip ?? 'waiting' }))
    setRows(initial)
    setRunning(true)
    const update = (i: number, patch: Partial<Row>) => setRows((current) => current && current.map((row, j) => (j === i ? { ...row, ...patch } : row)))
    // Un à la fois : un téléphone n'envoie pas bien dix PDF d'un coup.
    for (const [i, item] of plan.entries()) {
      if (item.skip) continue
      update(i, { status: 'saving' })
      try {
        await api.knitting.savePattern(batchFields(item.title), { pdfPath: null, newPdf: files[i]!, photos: [] }, null)
        update(i, { status: 'added' })
      } catch (e) {
        update(i, { status: 'failed', error: errorMessage(e) })
      }
    }
    setRunning(false)
  }

  function close() {
    if (running) return
    setRows(null)
    onDone()
  }

  const added = rows?.filter((r) => r.status === 'added').length ?? 0
  return (
    <>
      <Button type="button" variant="outline" className="h-10" onClick={() => input.current?.click()}>
        <Files /> Plusieurs PDF
      </Button>
      <input ref={input} type="file" multiple accept="application/pdf,.pdf" className="sr-only" aria-label="Choisir plusieurs PDF" tabIndex={-1} onChange={(e) => void start(e.target.files)} />
      <Dialog open={rows !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajout de plusieurs PDF</DialogTitle>
            <DialogDescription>
              {running ? 'Un patron par PDF, nommé d’après le fichier.' : `${added} patron${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} à la bibliothèque.`}
            </DialogDescription>
          </DialogHeader>
          <ul aria-label="PDF choisis" className="space-y-1.5">
            {rows?.map((row) => (
              <li key={row.key} className="flex items-start gap-2 text-sm">
                <StatusIcon status={row.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.title}</span>
                  <span className={row.status === 'failed' ? 'block text-destructive' : 'block text-muted-foreground'}>{row.status === 'failed' ? row.error : STATUS_TEXT[row.status]}</span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" className="h-10" disabled={running} onClick={close}>
              {running && <Loader2 className="animate-spin" aria-hidden />}
              {running ? 'Ajout en cours…' : 'Fermer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatusIcon({ status }: { status: Status }) {
  const className = 'mt-0.5 size-4 shrink-0'
  if (status === 'saving') return <Loader2 className={`${className} animate-spin text-muted-foreground`} aria-hidden />
  if (status === 'added') return <Check className={`${className} text-emerald-600`} aria-hidden />
  if (status === 'failed' || status === 'too-large') return <TriangleAlert className={`${className} text-destructive`} aria-hidden />
  return <Minus className={`${className} text-muted-foreground`} aria-hidden />
}

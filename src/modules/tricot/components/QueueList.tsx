// Patrons à faire plus tard (page Tricot) : les plus pressés d'abord, à ouvrir, commencer ou retirer.

import { ExternalLink, FileText, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { openInNewTab } from '@/lib/openInNewTab'
import { PRIORITIES, sortQueue, type QueuedPattern } from '../lib/yarn'

export function QueueList({ items, onChange }: { items: QueuedPattern[]; onChange: () => void }) {
  const api = useApi()
  const [removing, setRemoving] = useState<QueuedPattern | null>(null)

  async function openPdf(path: string) {
    await openInNewTab(() => api.knitting.pdfUrl(path)).catch((error: unknown) => toast.error(errorMessage(error)))
  }

  async function remove() {
    if (!removing) return
    try {
      await api.knitting.deleteQueued(removing)
      toast.success('Patron retiré')
      onChange()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <>
      <ul aria-label="Patrons à faire plus tard" className="space-y-2">
        {sortQueue(items).map((item) => (
          <li key={item.id} className="rounded-2xl border bg-background p-4 shadow-xs">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{item.title}</p>
                <p className="text-sm text-muted-foreground">
                  {[
                    PRIORITIES.find((p) => p.value === item.priority)?.label,
                    item.size && `taille ${item.size}`,
                    item.metersNeeded !== null && `${item.metersNeeded} m`,
                    item.needleMm !== null && `aiguilles ${String(item.needleMm).replace('.', ',')} mm`,
                    item.yarnIdea,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {item.notes && <p className="mt-1 text-sm whitespace-pre-line">{item.notes}</p>}
              </div>
              <Button variant="ghost" size="icon" aria-label={`Retirer ${item.title}`} onClick={() => setRemoving(item)}>
                <Trash2 />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.pdfPath && (
                <Button variant="outline" className="h-10" onClick={() => void openPdf(item.pdfPath!)}>
                  <FileText /> PDF
                </Button>
              )}
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
                  <ExternalLink /> Lien
                </a>
              )}
              {item.pdfPath && (
                <Link to={`/tricot/nouveau?patron=${item.id}`} className={cn(buttonVariants(), 'h-10')} aria-label={`Commencer ${item.title}`}>
                  <Play /> Commencer
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Retirer ce patron ?"
        description="Il quitte la liste des patrons à faire plus tard, avec son PDF."
        confirmLabel="Retirer"
        onConfirm={remove}
      />
    </>
  )
}

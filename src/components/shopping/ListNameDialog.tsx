import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnOpen } from '@/hooks/useOnOpen'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialName: string
  confirmLabel: string
  onSubmit: (name: string) => Promise<boolean>
}

/** Nom d'une liste de courses (création ou renommage). */
export function ListNameDialog({ open, onOpenChange, title, initialName, confirmLabel, onSubmit }: Props) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)

  useOnOpen(open, () => setName(initialName))

  const trimmed = name.trim()
  const error = trimmed.length > 80 ? '80 caractères maximum' : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || error) return
    setSaving(true)
    const ok = await onSubmit(trimmed)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="list-name">Nom</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(error) || undefined} className="h-10" />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || !trimmed || Boolean(error)}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

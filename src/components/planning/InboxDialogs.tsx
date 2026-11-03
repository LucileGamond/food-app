import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useOnOpen } from '@/hooks/useOnOpen'
import { formatDay, type IsoDate } from '@/lib/dates'
import type { InboxItem } from '@/lib/inbox'
import { SLOTS, slotLabel, type MealSlot, type Profile, type SlotRef } from '@/lib/meals'

interface PlanProps {
  item: InboxItem | null
  days: IsoDate[]
  profiles: Profile[]
  currentUserId: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (item: InboxItem, target: SlotRef, people: string[]) => Promise<boolean>
}

/** Choix du jour, du créneau et des personnes pour planifier un élément de la liste. */
export function InboxPlanDialog({ item, days, profiles, currentUserId, onOpenChange, onSubmit }: PlanProps) {
  const [date, setDate] = useState<IsoDate>('')
  const [slot, setSlot] = useState<MealSlot>('DINNER')
  const [people, setPeople] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useOnOpen(item !== null, () => {
    setDate(days[0] ?? '')
    setSlot('DINNER')
    setPeople(currentUserId ? [currentUserId] : [])
  })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!item || people.length === 0 || !date) return
    setSaving(true)
    const ok = await onSubmit(item, { date, slot }, people)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <DialogHeader>
            <DialogTitle>Planifier</DialogTitle>
            <DialogDescription>{item?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inbox-day">Jour</Label>
              <NativeSelect id="inbox-day" className="w-full" value={date} onChange={(e) => setDate(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inbox-slot">Créneau</Label>
              <NativeSelect id="inbox-slot" className="w-full" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
                {SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {slotLabel(s)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Pour qui ?</legend>
            <div className="flex flex-wrap gap-2">
              {profiles.map((profile) => (
                <label
                  key={profile.id}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-data-checked:border-foreground/30 has-data-checked:bg-muted"
                >
                  <Checkbox
                    checked={people.includes(profile.id)}
                    onCheckedChange={(checked) => setPeople((list) => (checked ? [...new Set([...list, profile.id])] : list.filter((p) => p !== profile.id)))}
                  />
                  {profile.display_name}
                </label>
              ))}
            </div>
            {people.length === 0 && <p className="text-sm text-destructive">Choisis au moins une personne.</p>}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || people.length === 0}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Planifier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface RenameProps {
  item: InboxItem | null
  onOpenChange: (open: boolean) => void
  onSubmit: (id: string, title: string) => Promise<boolean>
}

export function InboxRenameDialog({ item, onOpenChange, onSubmit }: RenameProps) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useOnOpen(item !== null, () => setTitle(item?.title ?? ''))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!item || !title.trim()) return
    setSaving(true)
    const ok = await onSubmit(item.id, title)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <DialogHeader>
            <DialogTitle>Renommer</DialogTitle>
            <DialogDescription>Le titre du repas une fois planifié.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="inbox-title">Titre</Label>
            <Input id="inbox-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-10" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" className="h-10" disabled={saving || !title.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Suppression d'un élément « À planifier » ou « De côté », avec ses photos : demandée à confirmer. */
export function RemoveInboxItemDialog({ item, onClose, onConfirm }: { item: InboxItem | null; onClose: () => void; onConfirm: (item: InboxItem) => Promise<unknown> }) {
  const photos = item?.photos?.length ?? 0
  return (
    <ConfirmDialog
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Supprimer cet élément ?"
      description={item && `« ${item.title} »${photos ? (photos > 1 ? ` et ses ${photos} photos seront supprimés.` : ' et sa photo seront supprimés.') : ' sera supprimé.'}`}
      confirmLabel="Supprimer"
      onConfirm={async () => {
        if (item) await onConfirm(item)
      }}
    />
  )
}

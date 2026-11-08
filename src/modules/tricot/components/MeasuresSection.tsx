// Fiches de mesures (page Tricot) : la sienne et celles des proches, pour choisir la taille d'un patron.

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadError } from '@/components/LoadError'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { describeProfile, MEASURE_KEYS, MEASURE_LABELS, parseMeasure, type MeasureKey, type MeasureProfile } from '../lib/sizing'
import { FoldHeader } from './FoldHeader'

type Fields = Record<MeasureKey, string>

const toText = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

/** Ajout ou modification d'une fiche : un nom et les mesures connues (toutes facultatives). */
function MeasuresDialog({ profile, open, onOpenChange, onSave }: { profile: MeasureProfile | null; open: boolean; onOpenChange: (open: boolean) => void; onSave: (name: string, measures: MeasureProfile['measures']) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Fields>({ chest: '', waist: '', hip: '', arm: '', head: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [shown, setShown] = useState<{ open: boolean; profile: MeasureProfile | null }>({ open: false, profile: null })

  // Formulaire rempli à chaque ouverture.
  if (shown.open !== open || shown.profile !== profile) {
    setShown({ open, profile })
    if (open) {
      setName(profile?.name ?? '')
      setFields(Object.fromEntries(MEASURE_KEYS.map((k) => [k, toText(profile?.measures[k] ?? null)])) as Fields)
      setError(null)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return setError('Indique le nom de la personne.')
    const measures = {} as MeasureProfile['measures']
    for (const key of MEASURE_KEYS) {
      const value = parseMeasure(fields[key])
      if (value === undefined) return setError(`${MEASURE_LABELS[key]} : un nombre de cm entre 10 et 300.`)
      measures[key] = value
    }
    setError(null)
    setSaving(true)
    if (await onSave(name, measures)) onOpenChange(false)
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{profile ? 'Modifier la fiche' : 'Nouvelle fiche de mesures'}</DialogTitle>
          <DialogDescription>Mesures du corps en cm, prises près du corps. Note celles que tu connais.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3" aria-label="Fiche de mesures">
          <div className="grid gap-1.5">
            <Label htmlFor="measures-name">Pour qui</Label>
            <Input id="measures-name" className="h-10" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Moi, Léa, papa…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MEASURE_KEYS.map((key) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`measures-${key}`}>{MEASURE_LABELS[key]} (cm)</Label>
                <Input id={`measures-${key}`} className="h-10" inputMode="decimal" value={fields[key]} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" className="h-10" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MeasuresSection() {
  const api = useApi()
  const list = useAsync(() => api.knitting.listMeasures(), [api])
  const [editing, setEditing] = useState<MeasureProfile | 'new' | null>(null)
  const [removing, setRemoving] = useState<MeasureProfile | null>(null)
  const [open, setOpen] = useState(false)
  const count = list.data?.length ?? 0

  async function save(name: string, measures: MeasureProfile['measures']): Promise<boolean> {
    try {
      await api.knitting.saveMeasures({ id: editing && editing !== 'new' ? editing.id : null, name, measures })
      list.reload()
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
      await api.knitting.deleteMeasures(removing.id)
      list.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <section aria-labelledby="knit-measures" className="mt-8 space-y-3">
      <FoldHeader
        id="knit-measures"
        title="Fiches de mesures"
        open={open}
        onToggle={() => setOpen((o) => !o)}
        count={count > 0 ? `${count} fiche${count > 1 ? 's' : ''}` : null}
        action={
          <Button variant="outline" className="h-10" onClick={() => setEditing('new')}>
            <Plus /> Nouvelle fiche
          </Button>
        }
      />
      <div id="knit-measures-content" hidden={!open && count > 0}>
        {list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <Skeleton className="h-16 rounded-2xl" aria-busy="true" aria-label="Chargement des fiches de mesures" />
        ) : list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune fiche : note tes mesures (et celles de tes proches pour un cadeau), l’appli conseillera la taille d’un patron.</p>
        ) : (
          <ul aria-label="Fiches de mesures" className="space-y-2">
            {list.data.map((profile) => (
              <li key={profile.id} className="flex items-start gap-2 rounded-2xl border bg-background p-4 shadow-xs">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{profile.name}</span>
                  <span className="text-muted-foreground">{describeProfile(profile)}</span>
                </p>
                <Button variant="ghost" size="icon" aria-label={`Modifier la fiche de ${profile.name}`} onClick={() => setEditing(profile)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Supprimer la fiche de ${profile.name}`} onClick={() => setRemoving(profile)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MeasuresDialog profile={editing && editing !== 'new' ? editing : null} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} onSave={save} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Supprimer cette fiche ?"
        description={removing ? `Les mesures de ${removing.name} seront supprimées.` : undefined}
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
    </section>
  )
}

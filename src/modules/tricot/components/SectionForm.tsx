// Formulaire d'une sous-étape : aiguille, type (rangs ou répétition), début (à la suite ou en même temps), rangs ou
// actions de chaque répétition.

import { X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { AddIcon, CloseIcon, DoneIcon } from './KnitIcons'
import { SegmentedRadio } from './SegmentedRadio'
import { guessStitches } from '../lib/stitches'
import { formatNeedle } from '../lib/needles'
import { formatStitches, formToSection, MAX_ACTIONS, sectionToForm, type SectionForm as Form, type SectionKind, type StepSection } from '../lib/pattern'

const STARTS: { value: Form['start']; label: string }[] = [
  { value: 'after', label: 'À la suite' },
  { value: 'at', label: 'En même temps' },
]

const KINDS: { value: SectionKind; label: string }[] = [
  { value: 'rows', label: 'Rangs sans répétition' },
  { value: 'repeat', label: 'Répétition' },
]

function NumberField({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" inputMode="numeric" {...props} />
    </div>
  )
}

/** Choix du rang de l'action dans la répétition : 1er, 2e… dernier. */
function rankOptions(every: number | null): { value: string; label: string }[] {
  if (!every || every < 2) return [{ value: 'last', label: 'Dernier rang' }, { value: '1', label: '1er rang' }].slice(0, every === 1 ? 1 : 2)
  return [
    { value: '1', label: '1er rang' },
    ...Array.from({ length: Math.min(every, 100) - 2 }, (_, i) => ({ value: String(i + 2), label: `${i + 2}e rang` })),
    { value: 'last', label: 'Dernier rang' },
  ]
}

/** Effet deviné d'après le texte, proposé en exemple (« -2 ») ; « ? » si on ne sait pas. */
function guessPlaceholder(text: string): string {
  const guess = text.trim() ? guessStitches(text) : null
  return guess === null ? '?' : formatStitches(guess)
}

export interface NeedleChoice {
  /** Aiguilles proposées : celles du patron et celles des échantillons. */
  needles: number[]
  /** Aiguille de la sous-étape d'avant (héritée si on n'en choisit pas). */
  inherited: number | null
}

interface Props {
  section: StepSection
  onSave: (s: StepSection) => void
  onCancel: () => void
  needle: NeedleChoice
}

export function SectionForm({ section, onSave, onCancel, needle }: Props) {
  const id = useId()
  const [form, setForm] = useState<Form>(() => sectionToForm(section))
  const [error, setError] = useState<string | null>(null)
  const set = (key: 'text' | 'rows' | 'every' | 'times' | 'atRow') => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setAction = (i: number, patch: Partial<Form['actions'][number]>) =>
    setForm((f) => ({ ...f, actions: f.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))
  const every = Number(form.every) || null
  const options = rankOptions(every)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = formToSection(form, section.pattern, section.at?.pattern ?? null)
    if (typeof result === 'string') return setError(result)
    onSave(result)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-background p-3" noValidate aria-label="Sous-étape">
      {section.pattern && (
        <p className="text-sm text-muted-foreground">
          Patron : <span className="font-medium text-foreground">{section.pattern}</span>
        </p>
      )}
      {needle.needles.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-needle`}>Aiguille</Label>
          <NativeSelect id={`${id}-needle`} className="h-10" value={form.needle ?? ''} onChange={(e) => setForm((f) => ({ ...f, needle: e.target.value }))}>
            <option value="">{needle.inherited !== null ? `Comme avant (${formatNeedle(needle.inherited)})` : needle.needles.length === 1 ? `${formatNeedle(needle.needles[0]!)}` : 'À choisir'}</option>
            {needle.needles.map((n) => (
              <option key={n} value={String(n)}>
                {formatNeedle(n)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <SegmentedRadio label="Type de sous-étape" options={KINDS} value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind }))} />
      <SegmentedRadio label="Début de la sous-étape" options={STARTS} value={form.start} onChange={(start) => setForm((f) => ({ ...f, start }))} />
      {form.start === 'at' && (
        <div className="space-y-1">
          {section.at?.pattern && (
            <p className="text-sm text-muted-foreground">
              Patron : <span className="font-medium text-foreground">à {section.at.pattern.replace(/^à\s+/i, '')}</span>
            </p>
          )}
          <NumberField id={`${id}-at`} label="À partir du rang" value={form.atRow} onChange={set('atRow')} placeholder="46" />
          <p className="text-xs text-muted-foreground">Rang de l’étape où cette sous-étape commence, pendant que les autres continuent. Les sous-étapes suivantes s’enchaînent derrière elle.</p>
        </div>
      )}
      {form.kind === 'rows' ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-text`}>Description (facultatif)</Label>
            <Input id={`${id}-text`} className="h-10" value={form.text} onChange={set('text')} maxLength={200} placeholder="jersey, côtes 1/1…" />
          </div>
          <NumberField id={`${id}-rows`} label="Nombre de rangs" value={form.rows} onChange={set('rows')} placeholder="10" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField id={`${id}-every`} label="Tous les … rangs" value={form.every} onChange={set('every')} placeholder="8" />
            <NumberField id={`${id}-times`} label="Nombre de fois" value={form.times} onChange={set('times')} placeholder="jusqu’à la fin" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Actions de chaque répétition</legend>
            <p className="text-xs text-muted-foreground">Pour chaque action : mailles ajoutées (+) ou retirées (−) à chaque fois, pour suivre le nombre de mailles.</p>
            {form.actions.map((action, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  aria-label={`Action ${i + 1}`}
                  className="h-10 min-w-0 flex-1"
                  value={action.text}
                  onChange={(e) => setAction(i, { text: e.target.value })}
                  maxLength={200}
                  placeholder="1 diminution de chaque côté"
                />
                <Input
                  aria-label={`Mailles de l’action ${i + 1}`}
                  title="Mailles ajoutées (+) ou retirées (−) à chaque fois"
                  className="h-10 w-16 shrink-0 px-2 text-center"
                  inputMode="numeric"
                  value={action.stitches}
                  onChange={(e) => setAction(i, { stitches: e.target.value })}
                  placeholder={guessPlaceholder(action.text)}
                />
                <NativeSelect aria-label={`Rang de l’action ${i + 1}`} className="w-32 shrink-0 px-2" value={options.some((o) => o.value === action.rank) ? action.rank : 'last'} onChange={(e) => setAction(i, { rank: e.target.value })}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
                {form.actions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    className="shrink-0"
                    aria-label={`Supprimer l’action ${i + 1}`}
                    onClick={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {form.actions.length < MAX_ACTIONS && (
              <Button type="button" variant="outline" className="h-10" onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { text: '', rank: '1', stitches: '' }] }))}>
                <AddIcon /> Ajouter une action
              </Button>
            )}
          </fieldset>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>
          <CloseIcon /> Annuler
        </Button>
        <Button type="submit" className="h-10">
          <DoneIcon /> Enregistrer
        </Button>
      </div>
    </form>
  )
}

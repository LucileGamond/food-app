import { ArrowDown, ArrowUp, Check, ListOrdered, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { RowDots } from './RowDots'
import {
  describeRange,
  describeSection,
  formToSection,
  MAX_ACTIONS,
  MAX_SECTIONS,
  nextActionRow,
  planSections,
  sectionIndexAt,
  sectionToForm,
  type KnitStep,
  type SectionForm as Form,
  type SectionKind,
  type StepSection,
} from '../lib/pattern'

const EMPTY: StepSection = { kind: 'rows', rows: null, every: null, times: null, text: '', pattern: null }

function NumberField({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-10" inputMode="numeric" {...props} />
    </div>
  )
}

const KINDS: { kind: SectionKind; label: string }[] = [
  { kind: 'rows', label: 'Rangs sans répétition' },
  { kind: 'repeat', label: 'Répétition' },
]

const selectClass =
  'h-10 rounded-lg border border-input bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/** Choix du rang de l'action dans la répétition : 1er, 2e… dernier. */
function rankOptions(every: number | null): { value: string; label: string }[] {
  if (!every || every < 2) return [{ value: 'last', label: 'Dernier rang' }, { value: '1', label: '1er rang' }].slice(0, every === 1 ? 1 : 2)
  return [
    { value: '1', label: '1er rang' },
    ...Array.from({ length: Math.min(every, 100) - 2 }, (_, i) => ({ value: String(i + 2), label: `${i + 2}e rang` })),
    { value: 'last', label: 'Dernier rang' },
  ]
}

function SectionForm({ section, onSave, onCancel }: { section: StepSection; onSave: (s: StepSection) => void; onCancel: () => void }) {
  const id = useId()
  const [form, setForm] = useState<Form>(() => sectionToForm(section))
  const [error, setError] = useState<string | null>(null)
  const set = (key: 'text' | 'rows' | 'every' | 'times') => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setAction = (i: number, patch: Partial<Form['actions'][number]>) =>
    setForm((f) => ({ ...f, actions: f.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))
  const every = Number(form.every) || null
  const options = rankOptions(every)

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = formToSection(form, section.pattern)
    if (typeof result === 'string') return setError(result)
    onSave(result)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-background p-3" noValidate aria-label="Section">
      {section.pattern && (
        <p className="text-sm text-muted-foreground">
          Patron : <span className="font-medium text-foreground">{section.pattern}</span>
        </p>
      )}
      <div role="radiogroup" aria-label="Type de section" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={form.kind === kind}
            onClick={() => setForm((f) => ({ ...f, kind }))}
            className={cn('rounded-md px-2 py-1.5 text-sm', form.kind === kind ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
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
                <select aria-label={`Rang de l’action ${i + 1}`} className={cn(selectClass, 'w-32 shrink-0')} value={options.some((o) => o.value === action.rank) ? action.rank : 'last'} onChange={(e) => setAction(i, { rank: e.target.value })}>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {form.actions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`Retirer l’action ${i + 1}`}
                    onClick={() => setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {form.actions.length < MAX_ACTIONS && (
              <Button type="button" variant="ghost" className="h-9" onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { text: '', rank: '1' }] }))}>
                <Plus /> Ajouter une action
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
        <Button type="button" variant="outline" className="h-9" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="h-9">
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/** Sections de l'étape, dans l'ordre : rangs sans répétition et répétitions, réglables en rangs selon sa laine. */
export function StepSections({ step, onChange, onCount }: { step: KnitStep; onChange: (sections: StepSection[]) => Promise<boolean>; onCount: (delta: number) => void }) {
  // Index en cours de modification ; `step.sections.length` = nouvelle section.
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const plan = planSections(step.sections, step.totalRows)
  const row = step.rowCount + 1
  const current = sectionIndexAt(plan, row)

  async function save(index: number, section: StepSection) {
    const next = [...step.sections]
    next[index] = section
    if (await onChange(next)) setEditing(null)
  }

  function move(index: number, by: -1 | 1) {
    const next = [...step.sections]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved!)
    void onChange(next)
  }

  return (
    <section aria-labelledby={`sections-${step.id}`} className="space-y-2">
      <h3 id={`sections-${step.id}`} className="flex items-center gap-1.5 text-sm font-medium">
        <ListOrdered className="size-4" aria-hidden /> Déroulé de l’étape
      </h3>
      <p className="text-xs text-muted-foreground">
        Une pastille par rang : touche-la quand le rang est fini, appui long pour la décocher. Bord{' '}
        <span className="font-medium text-red-600 dark:text-red-400">rouge</span> : diminution, bord{' '}
        <span className="font-medium text-blue-600 dark:text-blue-400">bleu</span> : augmentation.
      </p>
      <ol className="space-y-2 text-sm">
        {plan.map((p) => {
          const { section, index } = p
          if (editing === index) {
            return (
              <li key={index}>
                <SectionForm section={section} onSave={(s) => void save(index, s)} onCancel={() => setEditing(null)} />
              </li>
            )
          }
          const range = describeRange(p)
          const done = p.end !== null && p.end < row
          const toSet = (section.kind === 'rows' ? section.rows : section.every) === null
          const next = section.kind === 'repeat' ? nextActionRow(p, row) : null
          return (
            <li
              key={index}
              aria-current={current === index ? 'step' : undefined}
              className={cn('rounded-xl border px-3 py-2', current === index ? 'border-brand bg-brand/5' : 'bg-background', done && 'text-muted-foreground')}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn(!done && 'font-medium')}>
                    {done && <Check className="mr-1 inline size-3.5" aria-label="Faite" />}
                    {describeSection(section)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {toSet
                      ? 'Indique le nombre de rangs pour que la suite se calcule.'
                      : [range, current === index && next !== null && `prochaine fois : rang ${next}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions pour « ${describeSection(section)} »`} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditing(index)}>
                      <Pencil /> Régler
                    </DropdownMenuItem>
                    {index > 0 && (
                      <DropdownMenuItem onClick={() => move(index, -1)}>
                        <ArrowUp /> Monter
                      </DropdownMenuItem>
                    )}
                    {index < step.sections.length - 1 && (
                      <DropdownMenuItem onClick={() => move(index, 1)}>
                        <ArrowDown /> Descendre
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(index)}>
                      <Trash2 /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <RowDots planned={p} rowCount={step.rowCount} onCount={onCount} />
            </li>
          )
        })}
        {editing === step.sections.length && (
          <li>
            <SectionForm section={EMPTY} onSave={(s) => void save(step.sections.length, s)} onCancel={() => setEditing(null)} />
          </li>
        )}
      </ol>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette section ?"
        description={removing !== null && step.sections[removing] ? `« ${describeSection(step.sections[removing])} »` : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (removing !== null) await onChange(step.sections.filter((_, j) => j !== removing))
        }}
      />
      {editing === null && step.sections.length < MAX_SECTIONS && (
        <Button variant="outline" className="h-9" onClick={() => setEditing(step.sections.length)}>
          <Plus /> Ajouter une section
        </Button>
      )}
    </section>
  )
}

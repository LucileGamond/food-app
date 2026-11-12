import { ArrowDown, ArrowUp, Check, ListOrdered, MoreHorizontal, Pencil, Plus, Ruler, Trash2, X, Grid3x3 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { guessStitches } from '../lib/stitches'
import { describeConversion, parseMeasure, validateSection } from '../lib/measure'
import { withoutSection } from '../lib/sources'
import { effectiveNeedles, formatNeedle } from '../lib/needles'
import { looksEnglish, mergeGlossary, type Abbreviation } from '../lib/glossary'
import { useBaseGlossary } from '../hooks/useBaseGlossary'
import { SizedText } from './SizedText'
import type { KnitChart } from '../lib/chart'
import {
  describeRange,
  describeSection,
  formatStitches,
  formToSection,
  MAX_ACTIONS,
  MAX_SECTIONS,
  nextActionRow,
  planSections,
  isToSet,
  sectionIndicesAt,
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

/** Rangs calculés depuis une mesure du patron : le calcul, à vérifier puis valider (ou régler). */
function ConversionCheck({ section, onValidate, onEdit }: { section: StepSection; onValidate: () => void; onEdit: () => void }) {
  const calculation = describeConversion(section)
  if (!calculation) return null
  return (
    <div role="note" className="mt-2 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
      <p className="flex items-start gap-1.5">
        <Ruler className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span>
          Converti depuis le patron : {calculation} (arrondi). Vérifie ce nombre, puis valide-le ; il suit l’échantillon tant qu’il n’est pas validé.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-9" onClick={onValidate}>
          <Check /> Valider
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={onEdit}>
          <Pencil /> Régler
        </Button>
      </div>
    </div>
  )
}

const STARTS: { start: Form['start']; label: string }[] = [
  { start: 'after', label: 'À la suite' },
  { start: 'at', label: 'En même temps' },
]

const KINDS: { kind: SectionKind; label: string }[] = [
  { kind: 'rows', label: 'Rangs sans répétition' },
  { kind: 'repeat', label: 'Répétition' },
]

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

interface NeedleChoice {
  /** Aiguilles du patron. */
  needles: number[]
  /** Aiguille de la sous-étape d'avant (héritée si on n'en choisit pas). */
  inherited: number | null
}

function SectionForm({ section, onSave, onCancel, needle }: { section: StepSection; onSave: (s: StepSection) => void; onCancel: () => void; needle: NeedleChoice }) {
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
          <NativeSelect id={`${id}-needle`} className="h-9" value={form.needle ?? ''} onChange={(e) => setForm((f) => ({ ...f, needle: e.target.value }))}>
            <option value="">{needle.inherited !== null ? `Comme avant (${formatNeedle(needle.inherited)})` : needle.needles.length === 1 ? `${formatNeedle(needle.needles[0]!)}` : 'À choisir'}</option>
            {needle.needles.map((n) => (
              <option key={n} value={String(n)}>
                {formatNeedle(n)}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div role="radiogroup" aria-label="Type de sous-étape" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
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
      <div role="radiogroup" aria-label="Début de la sous-étape" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {STARTS.map(({ start, label }) => (
          <button
            key={start}
            type="button"
            role="radio"
            aria-checked={form.start === start}
            onClick={() => setForm((f) => ({ ...f, start }))}
            className={cn('rounded-md px-2 py-1.5 text-sm', form.start === start ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
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
              <Button type="button" variant="ghost" className="h-9" onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, { text: '', rank: '1', stitches: '' }] }))}>
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

/** Sections de l'étape (préparation), dans l'ordre : rangs sans répétition et répétitions, réglables en rangs selon sa laine. */
interface TextProps {
  /** Tailles du patron et celle mise en valeur, pour le paragraphe de chaque sous-étape. */
  sizes: string[]
  sizeIndex: number | null
  abbreviations: Abbreviation[]
}

export function StepSections({
  step,
  onChange,
  needles = [],
  text,
  charts = [],
}: {
  step: KnitStep
  onChange: (sections: StepSection[]) => Promise<boolean>
  needles?: number[]
  text?: TextProps
  /** Diagrammes de l'étape : chacun montré dans la sous-étape où il commence. */
  charts?: Pick<KnitChart, 'id' | 'title' | 'startRow' | 'endRow'>[]
}) {
  const base = useBaseGlossary()
  const glossary = text ? mergeGlossary(text.abbreviations, base, looksEnglish(step.instructions)) : []
  const own = effectiveNeedles(step.sections, needles)
  /** Aiguille héritée par la sous-étape `index` : celle d'avant, ou la seule du projet. */
  const inheritedAt = (index: number) => (index > 0 ? (own[index - 1] ?? null) : needles.length === 1 ? needles[0]! : null)
  // Index en cours de modification ; `step.sections.length` = nouvelle section.
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const plan = planSections(step.sections, step.totalRows)
  const row = step.rowCount + 1
  const current = sectionIndicesAt(plan, row)

  async function save(index: number, section: StepSection) {
    const next = [...step.sections]
    // Le texte du patron de la sous-étape reste avec elle quand on la règle.
    const source = step.sections[index]?.source
    next[index] = source ? { ...section, source } : section
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
        <ListOrdered className="size-4" aria-hidden /> Sous-étapes
      </h3>
      <p className="text-xs text-muted-foreground">Vérifie et corrige ce que la lecture a compris : le mode tricoter suit ces sous-étapes rang par rang.</p>
      <ol className="space-y-2 text-sm">
        {plan.map((p) => {
          const { section, index } = p
          if (editing === index) {
            return (
              <li key={index}>
                <SectionForm section={section} needle={{ needles, inherited: inheritedAt(index) }} onSave={(s) => void save(index, s)} onCancel={() => setEditing(null)} />
              </li>
            )
          }
          const range = describeRange(p)
          const done = p.end !== null && p.end < row
          const toSet = isToSet(section)
          const next = section.kind === 'repeat' ? nextActionRow(p, row) : null
          return (
            <li
              key={index}
              aria-current={current.includes(index) ? 'step' : undefined}
              className={cn('rounded-xl border px-3 py-2', current.includes(index) ? 'border-brand bg-brand/5' : 'bg-background', done && 'text-muted-foreground')}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn(!done && 'font-medium')}>
                    {done && <Check className="mr-1 inline size-3.5" aria-label="Faite" />}
                    {describeSection(section)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {toSet
                      ? (parseMeasure(section.pattern) ?? parseMeasure(section.at?.pattern ?? null)) !== null
                        ? 'Indique ton échantillon (ou celui du patron) dans « Laine et échantillon » pour convertir en rangs, ou règle le nombre de rangs.'
                        : 'Indique le nombre de rangs pour que la suite se calcule.'
                      : [range, current.includes(index) && next !== null && `prochaine fois : rang ${next}`].filter(Boolean).join(' · ')}
                  </p>
                  {p.start !== null &&
                    charts
                      .filter((c) => c.startRow >= p.start! && (p.end === null || c.startRow <= p.end))
                      .map((c) => (
                        <p key={c.id} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Grid3x3 className="size-3.5" aria-hidden /> Diagramme {c.title ? `« ${c.title} »` : ''} : rangs {c.startRow}
                          {c.endRow ? ` à ${c.endRow}` : ' et suivants'}
                        </p>
                      ))}
                  {section.source && text && (
                    <SizedText text={section.source} sizes={text.sizes} sizeIndex={text.sizeIndex} glossary={glossary} className="mt-1.5 rounded-lg bg-muted/40 px-2 py-1.5 text-foreground" />
                  )}
                  <ConversionCheck section={section} onValidate={() => void save(index, validateSection(section))} onEdit={() => setEditing(index)} />
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
            </li>
          )
        })}
        {editing === step.sections.length && (
          <li>
            <SectionForm section={EMPTY} needle={{ needles, inherited: inheritedAt(step.sections.length) }} onSave={(s) => void save(step.sections.length, s)} onCancel={() => setEditing(null)} />
          </li>
        )}
      </ol>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer cette sous-étape ?"
        description={removing !== null && step.sections[removing] ? `« ${describeSection(step.sections[removing])} »` : undefined}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (removing !== null) await onChange(withoutSection(step.sections, removing))
        }}
      />
      {editing === null && step.sections.length < MAX_SECTIONS && (
        <Button variant="outline" className="h-9" onClick={() => setEditing(step.sections.length)}>
          <Plus /> Ajouter une sous-étape
        </Button>
      )}
    </section>
  )
}

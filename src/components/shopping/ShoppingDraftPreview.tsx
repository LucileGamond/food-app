import { ArrowLeft, ExternalLink, Loader2, Plus, TriangleAlert, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ItemDialog } from '@/components/shopping/ItemDialog'
import { useApi } from '@/app/ApiContext'
import type { ShoppingFromPlanState } from '@/hooks/useShoppingFromPlan'
import { AISLES, defaultListName, formatAmount, type ShoppingItem, type ShoppingList } from '@/lib/shopping'
import { issueText, SKIP_LABELS, type DraftLine } from '@/lib/shoppingFromPlan'
import { cn } from '@/lib/utils'
import type { IsoDate } from '@/lib/dates'
import { capitalize } from '@/lib/text'
import type { NavState } from '@/lib/navState'

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

interface Props {
  flow: ShoppingFromPlanState
  today: IsoDate
  /** Bouton de gauche : retour au choix des repas, ou annulation. */
  backLabel: 'Retour' | 'Annuler'
  onBack: () => void
  /** Liste créée ou complétée : la fenêtre se ferme. */
  onDone: () => void
}

/** Aperçu des courses (articles par rayon, placard, non repris) et destination : nouvelle liste ou liste à compléter. */
export function ShoppingDraftPreview({ flow, today, backLabel, onBack, onDone }: Props) {
  const api = useApi()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<DraftLine | null>(null)
  const [lists, setLists] = useState<ShoppingList[] | null>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState(() => defaultListName(today))
  const [listId, setListId] = useState('')

  // Listes existantes, pour « Compléter une liste ».
  useEffect(() => {
    let active = true
    api.shopping.listLists().then(
      (data) => {
        if (!active) return
        setLists(data)
        setListId((id) => id || (data[0]?.id ?? ''))
      },
      () => active && setLists([]),
    )
    return () => {
      active = false
    }
  }, [api])

  const toBuy = flow.lines.filter((l) => l.include)
  const groups = AISLES.flatMap(({ value, label }) => {
    const items = flow.lines.filter((l) => !l.pantry && l.aisle === value)
    return items.length > 0 ? [{ value, label, items }] : []
  })
  const pantry = flow.lines.filter((l) => l.pantry)
  const trimmedName = name.trim()
  const nameError = trimmedName.length > 80 ? '80 caractères maximum' : null
  const destinationReady = mode === 'new' ? trimmedName !== '' && !nameError : listId !== ''

  async function submit() {
    const result = await flow.submit(mode === 'new' ? { kind: 'new', name: trimmedName } : { kind: 'existing', listId })
    if (!result) return
    onDone()
    if (result.count > 0) toast.success(`${plural(result.count, 'article')} ajouté${result.count > 1 ? 's' : ''}`)
    navigate(`/courses/${result.listId}`, { state: { skipped: result.skipped } satisfies NavState })
  }

  const editedItem: ShoppingItem | null = editing
    ? { id: editing.id, list_id: '', name: capitalize(editing.name), quantity: editing.quantity, unit: editing.unit, aisle: editing.aisle, checked: false, position: 0 }
    : null

  const lineRow = (line: DraftLine) => {
    const amount = formatAmount(line)
    const label = capitalize(line.name)
    return (
      <li key={line.id} data-testid="draft-line" className="flex min-h-12 items-center gap-1">
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox checked={line.include} onCheckedChange={() => flow.toggle(line.id)} aria-label={`Acheter « ${label} »`} className="size-5" />
        </label>
        <button
          type="button"
          onClick={() => setEditing(line)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate', !line.include && 'text-muted-foreground line-through')}>
              <span className="sr-only">Modifier</span> {label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{line.meals.join(', ')}</span>
            {line.issues.length > 0 && (
              <span className="mt-0.5 flex items-start gap-1 text-xs font-medium text-brand">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>À vérifier : {line.issues.map(issueText).join(' · ')}</span>
              </span>
            )}
          </span>
          {amount && <span className={cn('shrink-0 text-sm tabular-nums text-muted-foreground', !line.include && 'line-through')}>{amount}</span>}
        </button>
      </li>
    )
  }

  return (
    <>
          {flow.tidyFailed && (
            <p className="flex gap-2 rounded-xl border bg-muted/50 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              Regroupement automatique indisponible : les articles sont regroupés sans l’assistant.
            </p>
          )}
          {flow.unscaled.length > 0 && (
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              Quantités non adaptées au nombre de personnes (non précisé dans la recette) : {flow.unscaled.join(', ')}.
            </p>
          )}

          {flow.lines.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground">Aucun ingrédient trouvé.</p>}

          {groups.map((group) => (
            <section key={group.value} aria-labelledby={`draft-${group.value}`}>
              <h3 id={`draft-${group.value}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h3>
              <ul className="divide-y">{group.items.map(lineRow)}</ul>
            </section>
          ))}

          {pantry.length > 0 && (
            <section aria-labelledby="draft-pantry" className="rounded-xl border border-dashed px-2 py-2">
              <h3 id="draft-pantry" className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Placard
              </h3>
              <p className="px-2 text-xs text-muted-foreground">Basiques qu'on a en général déjà : coche ceux qui manquent.</p>
              <ul className="divide-y">{pantry.map(lineRow)}</ul>
            </section>
          )}

          {flow.skipped.length > 0 && (
            <section aria-labelledby="draft-skipped" className="rounded-xl border border-brand/25 bg-brand/5 p-3">
              <h3 id="draft-skipped" className="text-sm font-medium">
                Non repris ({flow.skipped.length})
              </h3>
              <p className="text-xs text-muted-foreground">À compléter à la main.</p>
              <ul className="mt-2 space-y-2">
                {flow.skipped.map((entry) => (
                  <li key={entry.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{entry.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SKIP_LABELS[entry.reason]} · {entry.detail}
                      </span>
                    </span>
                    <div className="flex items-center gap-3">
                      {entry.url && (
                        <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                          <ExternalLink className="size-3.5" aria-hidden /> Ouvrir <span className="sr-only">la recette « {entry.label} »</span>
                        </a>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => flow.addSkipped(entry)}>
                        <Plus /> Ajouter <span className="sr-only">« {entry.label} » comme article</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="sr-only">Destination</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border p-1" role="radiogroup" aria-label="Destination">
              {(['new', 'existing'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  disabled={value === 'existing' && lists !== null && lists.length === 0}
                  onClick={() => setMode(value)}
                  className={cn(
                    'h-9 rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
                    mode === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {value === 'new' ? 'Nouvelle liste' : 'Compléter une liste'}
                </button>
              ))}
            </div>
            {mode === 'new' ? (
              <div className="space-y-2">
                <Label htmlFor="plan-list-name">Nom de la liste</Label>
                <Input id="plan-list-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(nameError) || undefined} className="h-10" />
                {nameError && <p className="text-sm text-destructive">{nameError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="plan-list">Liste à compléter</Label>
                <NativeSelect id="plan-list" value={listId} onChange={(e) => setListId(e.target.value)} className="w-full px-2">
                  {(lists ?? []).map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">Les quantités s'ajoutent aux articles déjà sur la liste.</p>
              </div>
            )}
          </fieldset>

          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={onBack} disabled={flow.submitting}>
              {backLabel === 'Retour' && <ArrowLeft />} {backLabel}
            </Button>
            <Button className="h-10" disabled={flow.submitting || toBuy.length === 0 || !destinationReady} onClick={() => void submit()}>
              {flow.submitting && <Loader2 className="animate-spin" aria-hidden />}
              {mode === 'new' ? 'Créer la liste' : 'Ajouter'} ({plural(toBuy.length, 'article')})
            </Button>
          </DialogFooter>

      <ItemDialog
        item={editedItem}
        onOpenChange={(next) => !next && setEditing(null)}
        onSubmit={async (item, input) => {
          flow.update(item.id, input)
          return true
        }}
        onDelete={(item) => {
          if (flow.lines.find((l) => l.id === item.id)?.include) flow.toggle(item.id)
          setEditing(null)
        }}
      />
    </>
  )
}

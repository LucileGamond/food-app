import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react'
import { AddIcon, ChartIcon, DeleteIcon, DoneIcon, EditIcon, OrganizeIcon, StepsIcon, NeedlesIcon } from './KnitIcons'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { hasMeasure, validateSection } from '../lib/measure'
import { withoutSection } from '../lib/sources'
import { formatNeedle } from '../lib/needles'
import type { Abbreviation } from '../lib/glossary'
import { useStepSections } from '../hooks/useStepSections'
import { SizedText } from './SizedText'
import { HelpTip } from './HelpTip'
import { Note } from './Note'
import { ConversionCheck } from './ConversionCheck'
import { SectionForm } from './SectionForm'
import type { KnitChart } from '../lib/chart'
import { isChecked, type ProjectGauge } from '../lib/gauges'
import { TOUCH_AREA } from '../lib/touch'
import { SECTIONS_HELP } from '../lib/help'
import { describeRange, EMPTY_SECTION, describeSection, MAX_SECTIONS, nextActionRow, isToSet, type KnitStep, type StepSection } from '../lib/pattern'

/** Numéro de la sous-étape, en pastille : le même partout (liste, modification). */
function SectionNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-foreground', className)} aria-hidden>
      {n}
    </span>
  )
}

interface TextProps {
  /** Tailles du patron et celle mise en valeur, pour le paragraphe de chaque sous-étape. */
  sizes: string[]
  sizeIndex: number | null
  abbreviations: Abbreviation[]
}

/** Sections de l'étape (préparation), dans l'ordre : rangs sans répétition et répétitions, réglables en rangs selon sa laine. */
export function StepSections({
  step,
  onChange,
  needles = [],
  choices,
  text,
  charts = [],
  gauges = [],
  onCheckNeedle,
  onSetTotalRows,
  open = null,
  onOpened,
  organizeTo,
  headless = false,
}: {
  step: KnitStep
  onChange: (sections: StepSection[]) => Promise<boolean>
  needles?: number[]
  /** Aiguilles proposées au choix : celles du patron plus celles des échantillons (par défaut, celles du patron). */
  choices?: number[]
  text?: TextProps
  /** Diagrammes de l'étape : chacun montré dans la sous-étape où il commence. */
  charts?: Pick<KnitChart, 'id' | 'title' | 'startRow' | 'endRow'>[]
  /** Les échantillons du projet : ils disent si la conversion de chaque aiguille est vérifiée. */
  gauges?: ProjectGauge[]
  onCheckNeedle?: (needle: number | null) => Promise<void>
  /** Reprend pour l'étape le total des sous-étapes, quand elles le dépassent. */
  onSetTotalRows?: (totalRows: number) => Promise<void>
  /** Sous-étape à ouvrir (demandée depuis « À préparer ») ; `onOpened` quand c'est fait. */
  open?: number | null
  onOpened?: () => void
  /**
   * Adresse d'« Organiser », où les sous-étapes se déplacent avec leur texte. Absente quand Organiser ne peut pas
   * toucher l'étape (commencée, patron adapté) : Monter et Descendre restent alors ici.
   */
  organizeTo?: string
  /** Sans son titre ni son aide : la page les porte (bloc repliable). */
  headless?: boolean
}) {
  const offered = choices ?? needles
  const { glossary, own, inheritedAt, plan, row, current, issues, over } = useStepSections(step, needles, gauges, text?.abbreviations ?? null)
  // Index en cours de modification ; `step.sections.length` = nouvelle section.
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)

  useEffect(() => {
    if (open === null || open === undefined) return
    setEditing(open)
    onOpened?.()
  }, [open, onOpened])

  useEffect(() => {
    if (editing === null) return
    document.getElementById(`section-${step.id}-${editing}`)?.scrollIntoView({ block: 'center' })
  }, [editing, step.id])

  async function save(index: number, section: StepSection) {
    const next = [...step.sections]
    // Le texte du patron de la sous-étape reste avec elle quand on la règle.
    const { source, id } = step.sections[index] ?? {}
    next[index] = { ...section, ...(source ? { source } : {}), ...(id ? { id } : {}) }
    if (await onChange(next)) setEditing(null)
  }

  function move(index: number, by: -1 | 1) {
    const next = [...step.sections]
    const [moved] = next.splice(index, 1)
    next.splice(index + by, 0, moved!)
    void onChange(next)
  }

  return (
    // Sans titre (`headless`) : la page la met dans un bloc repliable « Sous-étapes », qui porte le titre et l'aide.
    <div role={headless ? undefined : 'region'} aria-labelledby={headless ? undefined : `sections-${step.id}`} className="space-y-2">
      {!headless && (
        <div className="flex items-center gap-1">
          <h3 id={`sections-${step.id}`} className="flex items-center gap-1.5 text-sm font-medium">
            <StepsIcon className="size-4" aria-hidden /> Sous-étapes
          </h3>
          <HelpTip label="sous-étapes">{SECTIONS_HELP}</HelpTip>
        </div>
      )}
      {over && (
        <Note kind="problem" title="Les sous-étapes dépassent l’étape">
          <p>
            L’étape annonce {over.total} rangs, mais les sous-étapes vont jusqu’au rang {over.end}. Corrige la sous-étape signalée, ou compte {over.end} rangs pour l’étape.
          </p>
          {onSetTotalRows && (
            <Button variant="outline" className="mt-2 h-10" onClick={() => void onSetTotalRows(over.end)}>
              <DoneIcon /> Compter {over.end} rangs pour l’étape
            </Button>
          )}
        </Note>
      )}
      <ol className="space-y-2 text-sm">
        {plan.map((p) => {
          const { section, index } = p
          if (editing === index) {
            // En haut : la sous-étape modifiée, en entier (titre et texte du patron), pour s'y retrouver.
            return (
              <li key={index} id={`section-${step.id}-${index}`} className="space-y-2 rounded-xl border-2 border-brand bg-brand/5 p-2" aria-labelledby={`section-${step.id}-${index}-title`}>
                <div className="flex items-start gap-2 px-1 pt-1">
                  <SectionNumber n={index + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Modifier la sous-étape {index + 1}</p>
                    <p id={`section-${step.id}-${index}-title`} className="font-medium">
                      {describeSection(section)}
                    </p>
                  </div>
                </div>
                {section.source && text && (
                  <SizedText text={section.source} sizes={text.sizes} sizeIndex={text.sizeIndex} glossary={glossary} className="rounded-lg bg-background px-2 py-1.5 text-foreground" />
                )}
                <SectionForm section={section} needle={{ needles: offered, inherited: inheritedAt(index) }} onSave={(s) => void save(index, s)} onCancel={() => setEditing(null)} />
              </li>
            )
          }
          if (editing !== null) {
            // Pendant une modification, les autres sous-étapes se font discrètes : une ligne, pour situer.
            return (
              <li key={index} id={`section-${step.id}-${index}`} className="flex items-center gap-2 px-3 py-1 text-muted-foreground" data-testid="section-aside">
                <SectionNumber n={index + 1} className="bg-transparent text-muted-foreground" />
                <span className="min-w-0 truncate">{describeSection(section)}</span>
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
              id={`section-${step.id}-${index}`}
              aria-current={current.includes(index) ? 'step' : undefined}
              className={cn(
                'rounded-xl border px-3 py-2',
                issues.has(index) ? 'border-amber-500/40 bg-amber-500/5' : current.includes(index) ? 'border-brand bg-brand/5' : 'bg-background',
                done && 'text-muted-foreground',
              )}
            >
              {/* Le menu ne garde que la ligne du titre : texte, encadrés et boutons prennent toute la largeur. */}
              <div className="flex items-start gap-2">
                <SectionNumber n={index + 1} className="mt-0.5" />
                <p className={cn('min-w-0 flex-1 pt-0.5', !done && 'font-medium')}>
                  {done && <DoneIcon className="mr-1 inline size-3.5" aria-label="Faite" />}
                  {describeSection(section)}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-touch" className="-my-1.5 -mr-1.5" aria-label={`Actions pour « ${describeSection(section)} »`} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setEditing(index)}>
                      <EditIcon /> Modifier
                    </DropdownMenuItem>
                    {organizeTo ? (
                      <DropdownMenuItem render={<Link to={organizeTo} />}>
                        <OrganizeIcon /> Déplacer…
                      </DropdownMenuItem>
                    ) : null}
                    {!organizeTo && index > 0 && (
                      <DropdownMenuItem onClick={() => move(index, -1)}>
                        <ArrowUp /> Monter
                      </DropdownMenuItem>
                    )}
                    {!organizeTo && index < step.sections.length - 1 && (
                      <DropdownMenuItem onClick={() => move(index, 1)}>
                        <ArrowDown /> Descendre
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(index)}>
                      <DeleteIcon /> Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                {offered.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    className={cn(
                      'relative mt-1 inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                      TOUCH_AREA,
                      own[index] === null ? 'bg-amber-500/15 font-medium' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <NeedlesIcon className="size-4" />
                    {own[index] === null ? 'Aiguille à choisir' : `Aiguille ${formatNeedle(own[index]!)}`}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  {toSet ? (
                    hasMeasure(section) ? (
                      <>
                        Sans échantillon, les centimètres ne se convertissent pas en rangs.{' '}
                        <Link
                          to={`?onglet=demarrer&echantillon=${own[index] === null ? 'defaut' : own[index]}`}
                          className="font-medium text-foreground underline underline-offset-4"
                        >
                          {own[index] === null ? 'Noter mon échantillon' : `Noter mon échantillon à l’aiguille ${formatNeedle(own[index]!)}`}
                        </Link>
                      </>
                    ) : (
                      'Indique le nombre de rangs pour que la suite se calcule.'
                    )
                  ) : (
                    [range, current.includes(index) && next !== null && `prochaine fois : rang ${next}`].filter(Boolean).join(' · ')
                  )}
                </p>
                {p.start !== null &&
                  charts
                    .filter((c) => c.startRow >= p.start! && (p.end === null || c.startRow <= p.end))
                    .map((c) => (
                      <p key={c.id} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ChartIcon className="size-3.5" aria-hidden /> Diagramme {c.title ? `« ${c.title} »` : ''} : rangs {c.startRow}
                        {c.endRow ? ` à ${c.endRow}` : ' et suivants'}
                      </p>
                    ))}
                {section.source && text && (
                  <SizedText text={section.source} sizes={text.sizes} sizeIndex={text.sizeIndex} glossary={glossary} className="mt-1.5 rounded-lg bg-muted/40 px-2 py-1.5 text-foreground" />
                )}
                <ConversionCheck
                  section={section}
                  check={onCheckNeedle ? { needle: own[index] ?? null, checked: isChecked(gauges, own[index] ?? null) } : undefined}
                  onValidate={() => void (onCheckNeedle ? onCheckNeedle(own[index] ?? null) : save(index, validateSection(section)))}
                  onEdit={() => setEditing(index)}
                />
              </div>
            </li>
          )
        })}
        {editing === step.sections.length && (
          <li id={`section-${step.id}-${step.sections.length}`} className="space-y-2 rounded-xl border-2 border-brand bg-brand/5 p-2">
            <div className="flex items-center gap-2 px-1 pt-1">
              <SectionNumber n={step.sections.length + 1} />
              <p className="font-medium">Nouvelle sous-étape</p>
            </div>
            <SectionForm section={EMPTY_SECTION} needle={{ needles: offered, inherited: inheritedAt(step.sections.length) }} onSave={(s) => void save(step.sections.length, s)} onCancel={() => setEditing(null)} />
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
        <Button variant="outline" className="h-10" onClick={() => setEditing(step.sections.length)}>
          <AddIcon /> Ajouter une sous-étape
        </Button>
      )}
    </div>
  )
}

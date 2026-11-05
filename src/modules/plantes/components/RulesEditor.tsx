import { isCivilDate } from '@watering/civil-date.ts'
import { upcoming } from '@watering/schedule.ts'
import { CalendarDays, Droplets, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { formatShortDate } from '../lib/dates'
import { formatAmount, formatMonths } from '../lib/format'
import { nextRuleDefaults, toRuleInput, type AmountUnit, type PlantFormErrors, type RuleFormValues } from '../lib/form'
import type { IntervalUnit } from '../lib/plants'
import { MonthPicker } from './MonthPicker'

interface Props {
  rules: RuleFormValues[]
  /** Erreurs affichées (après une tentative d'enregistrement). */
  errors: PlantFormErrors['rules']
  onChange: (rules: RuleFormValues[]) => void
  today: string
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Aperçu des prochains arrosages de la règle, calculé en direct par le moteur. */
function RulePreview({ rule, today }: { rule: RuleFormValues; today: string }) {
  const input = toRuleInput(rule)
  const valid = input.months.length > 0 && isCivilDate(input.first_watering_on) && input.interval_count >= 1 && input.amount_ml >= 1
  if (!valid) return null
  const next = upcoming(
    [{ id: 'preview', months: input.months, firstWateringOn: input.first_watering_on, intervalCount: input.interval_count, intervalUnit: input.interval_unit, amountMl: input.amount_ml }],
    today,
    5,
  )
  return (
    <p className="flex items-start gap-2 rounded-lg bg-water-soft px-3 py-2 text-sm">
      <CalendarDays className="mt-0.5 size-4 shrink-0 text-water" aria-hidden />
      <span>
        <span className="font-medium">Prochains arrosages : </span>
        {next.length === 0 ? 'aucun dans l’année à venir' : `${next.map((o) => formatShortDate(o.date)).join(', ')} · ${formatAmount(input.amount_ml)}`}
      </span>
    </p>
  )
}

/** Règles d'arrosage d'une plante : une par période de l'année. */
export function RulesEditor({ rules, errors, onChange, today }: Props) {
  const update = (index: number, patch: Partial<RuleFormValues>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))

  return (
    <div className="space-y-4">
      {rules.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Aucune règle : la plante n’aura pas de rappel d’arrosage.</p>
      )}

      {rules.map((rule, index) => {
        const ruleErrors = errors[index] ?? {}
        const id = (name: string) => `rule-${index}-${name}`
        const describedBy = (field: keyof typeof ruleErrors, name: string) => (ruleErrors[field] ? id(`${name}-error`) : undefined)
        return (
          // Les règles n'ont pas d'identifiant avant l'enregistrement : la position suffit (ajout à la fin, suppression).
          <fieldset key={index} className="space-y-4 rounded-xl border bg-background p-4" aria-labelledby={id('legend')}>
            <div className="flex items-center justify-between gap-2">
              <legend id={id('legend')} className="flex items-center gap-2 font-medium">
                <Droplets className="size-4 text-water" aria-hidden />
                Règle {index + 1}
                {rule.months.length > 0 && <span className="font-normal text-muted-foreground">· {formatMonths(rule.months)}</span>}
              </legend>
              <Button type="button" variant="ghost" size="icon-lg" aria-label={`Supprimer la règle ${index + 1}`} onClick={() => onChange(rules.filter((_, i) => i !== index))}>
                <Trash2 />
              </Button>
            </div>

            <div className="space-y-2">
              <p id={id('months-label')} className="text-sm font-medium">
                Mois concernés
              </p>
              <MonthPicker value={rule.months} onChange={(months) => update(index, { months })} invalid={Boolean(ruleErrors.months)} labelledBy={id('months-label')} />
              <FieldError id={id('months-error')} message={ruleErrors.months} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={id('first')}>1er arrosage</Label>
                <Input
                  id={id('first')}
                  type="date"
                  className="h-10"
                  value={rule.first_watering_on}
                  onChange={(e) => update(index, { first_watering_on: e.target.value })}
                  aria-invalid={Boolean(ruleErrors.first_watering_on)}
                  aria-describedby={describedBy('first_watering_on', 'first')}
                />
                <FieldError id={id('first-error')} message={ruleErrors.first_watering_on} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={id('count')}>Fréquence</Label>
                <div className="flex gap-2">
                  <span className="flex h-10 items-center text-sm text-muted-foreground">Tous les</span>
                  <Input
                    id={id('count')}
                    inputMode="numeric"
                    className="h-10 w-16"
                    value={rule.interval_count}
                    onChange={(e) => update(index, { interval_count: e.target.value })}
                    aria-invalid={Boolean(ruleErrors.interval_count)}
                    aria-describedby={describedBy('interval_count', 'count')}
                  />
                  <NativeSelect
                    aria-label={`Unité de fréquence de la règle ${index + 1}`}
                    className="flex-1 px-2"
                    value={rule.interval_unit}
                    onChange={(e) => update(index, { interval_unit: e.target.value as IntervalUnit })}
                  >
                    <option value="day">jours</option>
                    <option value="week">semaines</option>
                    <option value="month">mois</option>
                  </NativeSelect>
                </div>
                <FieldError id={id('count-error')} message={ruleErrors.interval_count} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={id('amount')}>Quantité</Label>
                <div className="flex gap-2">
                  <Input
                    id={id('amount')}
                    inputMode="decimal"
                    className="h-10 flex-1"
                    value={rule.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                    aria-invalid={Boolean(ruleErrors.amount)}
                    aria-describedby={describedBy('amount', 'amount')}
                  />
                  <NativeSelect
                    aria-label={`Unité de quantité de la règle ${index + 1}`}
                    className="px-2"
                    value={rule.amount_unit}
                    onChange={(e) => update(index, { amount_unit: e.target.value as AmountUnit })}
                  >
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                  </NativeSelect>
                </div>
                <FieldError id={id('amount-error')} message={ruleErrors.amount} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={id('note')}>Remarque (facultatif)</Label>
              <Input
                id={id('note')}
                className="h-10"
                placeholder="Ex. eau de pluie, par le dessous…"
                value={rule.note}
                onChange={(e) => update(index, { note: e.target.value })}
                aria-invalid={Boolean(ruleErrors.note)}
                aria-describedby={describedBy('note', 'note')}
              />
              <FieldError id={id('note-error')} message={ruleErrors.note} />
            </div>

            <RulePreview rule={rule} today={today} />
          </fieldset>
        )
      })}

      <Button type="button" variant="outline" className="h-10" onClick={() => onChange([...rules, nextRuleDefaults(rules, today)])}>
        <Plus /> Ajouter une règle
      </Button>
    </div>
  )
}

// Réglages → Consommation IA : budget mensuel du foyer (au-delà, les fonctions IA sont bloquées par le serveur) et
// crédit restant sur la clé Anthropic (recharges saisies à la main ; coût réel via l'API Admin, s'il est disponible).

import { Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import type { LlmCredit, RealCost } from '@/api/llmUsage'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { budgetView, creditView, formatUsd, parseAmount, type BudgetStatus, type CreditStatus } from '@/lib/llmBudget'
import { formatEur, USD_TO_EUR } from '@/lib/llmUsage'

const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const updatedAt = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function BudgetBlock({ status, onSaved }: { status: BudgetStatus; onSaved: () => Promise<void> }) {
  const api = useApi()
  const view = budgetView(status)
  const [text, setText] = useState(status.monthlyEur === null ? '' : String(status.monthlyEur).replace('.', ','))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(monthlyEur: number | null) {
    setSaving(true)
    try {
      await api.llmUsage.setBudget(monthlyEur)
      await onSaved()
      toast.success(monthlyEur === null ? 'Budget IA retiré' : 'Budget IA enregistré')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const amount = parseAmount(text)
    if (amount === null) return setError('Montant invalide : un nombre positif, par exemple 5 ou 7,50.')
    setError(null)
    void save(amount)
  }

  return (
    <div role="group" aria-labelledby="budget-ia-titre" className="rounded-xl bg-muted/50 p-3">
      <h3 id="budget-ia-titre" className="text-sm font-medium">
        Budget du mois
      </h3>
      {view.monthlyEur === null ? (
        <p className="mt-1 text-sm text-muted-foreground">Pas de budget : les fonctions IA ne sont jamais bloquées. Ce mois-ci : {formatEur(view.spentEur)}.</p>
      ) : (
        <div className="mt-1 space-y-1.5">
          <p className="flex justify-between gap-3 text-sm">
            <span>
              {formatEur(view.spentEur)} sur {formatEur(view.monthlyEur)}
            </span>
            <span className="text-muted-foreground">Reste {formatEur(view.remainingEur ?? 0)}</span>
          </p>
          <div
            role="progressbar"
            aria-label="Part du budget dépensée"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((view.ratio ?? 0) * 100)}
            className="h-2 overflow-hidden rounded-full bg-background"
          >
            <div className={view.reached ? 'h-full bg-destructive' : 'h-full bg-primary'} style={{ width: `${Math.round((view.ratio ?? 0) * 100)}%` }} />
          </div>
          {view.reached && <p className="text-sm text-destructive">Budget atteint : les fonctions IA sont bloquées jusqu’au 1er du mois prochain.</p>}
        </div>
      )}
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <div className="space-y-1">
          <Label htmlFor="budget-ia-montant">Budget mensuel (€)</Label>
          <Input id="budget-ia-montant" inputMode="decimal" className="h-9 w-28" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button type="submit" className="h-9" disabled={saving} aria-label="Enregistrer le budget">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
        {view.monthlyEur !== null && (
          <Button type="button" variant="outline" className="h-9" disabled={saving} onClick={() => void save(null)}>
            Retirer le budget
          </Button>
        )}
      </form>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function CreditBlock({ status, credits, realCost, onChanged }: { status: CreditStatus; credits: LlmCredit[]; realCost: RealCost | null; onChanged: () => Promise<void> }) {
  const api = useApi()
  const real = realCost?.available && realCost.costUsd !== undefined ? realCost.costUsd : null
  const view = creditView(status, real)
  const [addedOn, setAddedOn] = useState(today)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true)
    try {
      await action()
      await onChanged()
      toast.success(done)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const amountUsd = parseAmount(amount)
    if (amountUsd === null || !addedOn) return setError('Montant invalide : un nombre positif, par exemple 10 ou 12,50.')
    setError(null)
    void run(async () => {
      await api.llmUsage.addCredit({ addedOn, amountUsd, note: note.trim() || null })
      setAmount('')
      setNote('')
    }, 'Recharge ajoutée')
  }

  return (
    <div role="group" aria-labelledby="credit-ia-titre" className="rounded-xl bg-muted/50 p-3">
      <h3 id="credit-ia-titre" className="text-sm font-medium">
        Crédit Anthropic
      </h3>
      {view.since === null ? (
        <p className="mt-1 text-sm text-muted-foreground">Aucune recharge saisie : ajoute celles de la Console Anthropic (Billing) pour suivre le crédit restant.</p>
      ) : (
        <dl className="mt-1 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt>Restant estimé (appels de Life)</dt>
            <dd className="text-right">
              <span className="font-medium tabular-nums">{formatUsd(view.estimatedUsd)}</span>{' '}
              <span className="text-muted-foreground">(≈ {formatEur(view.estimatedUsd * USD_TO_EUR)})</span>
            </dd>
          </div>
          {view.realUsd !== null && realCost?.available && realCost.fetchedAt && (
            <div className="flex justify-between gap-3">
              <dt>
                Restant réel (Anthropic)
                <span className="block text-xs text-muted-foreground">mis à jour le {updatedAt(realCost.fetchedAt)}</span>
              </dt>
              <dd className="font-medium tabular-nums">{formatUsd(view.realUsd)}</dd>
            </div>
          )}
          {realCost?.available && realCost.error && <p className="text-muted-foreground">{realCost.error}</p>}
          {realCost && !realCost.available && (
            <p className="text-xs text-muted-foreground">Coût réel : ajoute la clé Admin Anthropic (secret ANTHROPIC_ADMIN_KEY) pour comparer avec la facture.</p>
          )}
        </dl>
      )}

      {credits.length > 0 && (
        <ul aria-label="Recharges" className="mt-2 divide-y text-sm">
          {credits.map((credit) => (
            <li key={credit.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0">
                {formatDate(credit.addedOn)} · <span className="tabular-nums">{formatUsd(credit.amountUsd)}</span>
                {credit.note && <span className="text-muted-foreground"> · {credit.note}</span>}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={busy}
                aria-label={`Supprimer la recharge du ${formatDate(credit.addedOn)}`}
                onClick={() => void run(() => api.llmUsage.deleteCredit(credit.id), 'Recharge supprimée')}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <div className="space-y-1">
          <Label htmlFor="credit-ia-date">Date</Label>
          <Input id="credit-ia-date" type="date" className="h-9 w-40" value={addedOn} onChange={(e) => setAddedOn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="credit-ia-montant">Montant ($)</Label>
          <Input id="credit-ia-montant" inputMode="decimal" className="h-9 w-24" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="min-w-32 flex-1 space-y-1">
          <Label htmlFor="credit-ia-note">Note (facultatif)</Label>
          <Input id="credit-ia-note" className="h-9" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" className="h-9" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Ajouter la recharge
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function LlmBudgetSettings() {
  const api = useApi()
  const [data, setData] = useState<{ budget: BudgetStatus; credit: CreditStatus; credits: LlmCredit[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [realCost, setRealCost] = useState<RealCost | null>(null)

  const apply = useCallback(
    (promise: Promise<[BudgetStatus, CreditStatus, LlmCredit[]]>) =>
      promise.then(
        ([budget, credit, credits]) => {
          setData({ budget, credit, credits })
          setError(null)
        },
        (e: unknown) => setError(errorMessage(e)),
      ),
    [],
  )
  const fetchAll = useCallback(() => Promise.all([api.llmUsage.budgetStatus(), api.llmUsage.creditStatus(), api.llmUsage.listCredits()]), [api])
  const load = useCallback(() => apply(fetchAll()), [apply, fetchAll])

  // Coût réel : demandé seulement quand les statistiques sont affichées (gardé 48 h côté serveur).
  const loadRealCost = useCallback(
    () => api.llmUsage.realCost().then(setRealCost, (e: unknown) => setRealCost({ available: true, since: null, error: errorMessage(e) })),
    [api],
  )

  useEffect(() => {
    void apply(fetchAll())
    void loadRealCost()
  }, [apply, fetchAll, loadRealCost])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return null
  return (
    <div className="space-y-3">
      <BudgetBlock key={String(data.budget.monthlyEur)} status={data.budget} onSaved={load} />
      <CreditBlock
        status={data.credit}
        credits={data.credits}
        realCost={realCost}
        onChanged={async () => {
          await load()
          void loadRealCost()
        }}
      />
    </div>
  )
}

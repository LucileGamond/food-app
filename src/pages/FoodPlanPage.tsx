import { ArrowLeft, ClipboardList, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/Layout'
import { PlanItemDialog } from '@/components/food/PlanItemDialog'
import { ProfileSwitch, useProfileParam } from '@/components/food/ProfileSwitch'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useFoodPlan } from '@/hooks/useFoodPlan'
import { formatPortion, groupItems, mealLabel, nextPosition, type FoodMeal, type PlanItem, type PlanItemInput } from '@/lib/food'

type DialogState =
  | { kind: 'none' }
  | { kind: 'form'; item: PlanItem | null; defaults?: { meal: FoodMeal; category: string } }
  | { kind: 'delete'; item: PlanItem }

export function FoodPlanPage() {
  const api = useApi()
  const { profiles } = useAuth()
  const [profile, selectProfile] = useProfileParam()
  const plan = useFoodPlan(api, profile?.id ?? null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const groups = useMemo(() => groupItems(plan.items), [plan.items])
  const close = () => setDialog({ kind: 'none' })
  const deleting = dialog.kind === 'delete' ? dialog.item : null

  function submit(input: PlanItemInput, id?: string) {
    return plan.save(id ? input : { ...input, position: nextPosition(plan.items, input.meal, input.category) }, id)
  }

  const addButton = (
    <Button className="h-10 px-4" onClick={() => setDialog({ kind: 'form', item: null })} disabled={!profile}>
      <Plus /> Ajouter un aliment
    </Button>
  )

  return (
    <>
      <Link
        to={`/plan${profile ? `?profil=${profile.id}` : ''}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Plan
      </Link>
      <PageHeader
        title="Plan alimentaire"
        description="Quotas par période. Les changements s'appliquent aux prochaines périodes."
        actions={addButton}
      />

      <div className="mb-4">
        <ProfileSwitch profiles={profiles} value={profile?.id ?? null} onChange={selectProfile} />
      </div>

      {plan.loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{plan.loadError}</p>
          <Button variant="outline" onClick={() => void plan.reload()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : plan.loading || !profile ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement du plan">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : plan.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Plan vide"
          description={`Ajoute les aliments du plan de ${profile.display_name}, avec le nombre de fois autorisé par période.`}
          action={addButton}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.meal} aria-labelledby={`plan-${group.meal}`} className="rounded-2xl border bg-background p-4 shadow-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id={`plan-${group.meal}`} className="font-semibold tracking-tight">
                  {group.label}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: 'form', item: null, defaults: { meal: group.meal, category: '' } })}
                  aria-label={`Ajouter un aliment (${group.label})`}
                >
                  <Plus /> Ajouter
                </Button>
              </div>
              <div className="space-y-3">
                {group.categories.map((category) => (
                  <div key={category.name}>
                    <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{category.name}</h3>
                    <ul className="divide-y">
                      {category.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: 'form', item })}
                            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="sr-only">Modifier</span>{' '}
                              <span className="font-medium">{item.name}</span>
                              {item.quantity !== null && <span className="text-muted-foreground"> · {formatPortion(item.quantity, item.unit)}</span>}
                            </span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">× {item.allowed_occurrences}</span>
                            <span className="sr-only">{` (${group.label})`}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PlanItemDialog
        open={dialog.kind === 'form'}
        onOpenChange={(open) => !open && close()}
        editing={dialog.kind === 'form' ? dialog.item : null}
        defaults={dialog.kind === 'form' ? dialog.defaults : undefined}
        items={plan.items}
        onSubmit={submit}
        onDelete={(item) => setDialog({ kind: 'delete', item })}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && close()}
        title="Retirer cet aliment du plan ?"
        description={deleting ? `${deleting.name} (${mealLabel(deleting.meal)}). Les périodes déjà créées ne changent pas.` : undefined}
        confirmLabel="Retirer"
        onConfirm={async () => {
          if (deleting) await plan.remove(deleting.id)
        }}
      />
    </>
  )
}

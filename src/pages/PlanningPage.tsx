import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, MoveRight, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/Layout'
import { DayCard } from '@/components/planning/DayCard'
import { InboxPlanDialog, InboxRenameDialog } from '@/components/planning/InboxDialogs'
import { InboxPanel, type InboxDragData } from '@/components/planning/InboxPanel'
import { MealDialog } from '@/components/planning/MealDialog'
import type { MealAction } from '@/components/planning/MealItem'
import { MealTargetDialog } from '@/components/planning/MealTargetDialog'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { useInbox } from '@/hooks/useInbox'
import { PLANNING_DAYS, usePlanning } from '@/hooks/usePlanning'
import { addDays, formatDay, formatRange, nextDays, todayIso, type IsoDate } from '@/lib/dates'
import type { InboxItem } from '@/lib/inbox'
import {
  dropTarget,
  groupMealsBySlot,
  peopleLabel,
  slotLabel,
  type Meal,
  type MealRecipeSource,
  type MealSlot,
  type RecipeSummary,
  type SlotRef,
} from '@/lib/meals'

type DialogState =
  | { kind: 'none' }
  | { kind: 'form'; target: SlotRef; meal: Meal | null }
  | { kind: 'move' | 'duplicate'; meal: Meal }
  | { kind: 'delete'; meal: Meal }
  | { kind: 'plan' | 'rename'; item: InboxItem }

interface MealDragState {
  meal: Meal
  mode: 'move' | 'copy'
}

type DragState = MealDragState | InboxDragData

export function PlanningPage({ today = todayIso() }: { today?: IsoDate }) {
  const api = useApi()
  const navigate = useNavigate()
  const { profiles, userId } = useAuth()
  const [start, setStart] = useState<IsoDate>(today)
  const planning = usePlanning(api, start)
  const inbox = useInbox(api)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const [savedRecipes, setSavedRecipes] = useState<RecipeSummary[] | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const days = useMemo(() => nextDays(start, PLANNING_DAYS), [start])
  const mealsBySlot = useMemo(() => groupMealsBySlot(planning.meals), [planning.meals])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const loadSavedRecipes = useCallback(() => {
    setSavedRecipes(null)
    api.recipes.listSavedSummaries().then(setSavedRecipes, () => setSavedRecipes([]))
  }, [api])

  function openForm(target: SlotRef, meal: Meal | null) {
    loadSavedRecipes()
    setDialog({ kind: 'form', target, meal })
  }

  function handleAction(action: MealAction, meal: Meal) {
    switch (action) {
      case 'edit':
        openForm({ date: meal.meal_date, slot: meal.slot }, meal)
        break
      case 'move':
      case 'duplicate':
        setDialog({ kind: action, meal })
        break
      case 'save':
        navigate(`/recettes/${meal.recipe.id}/modifier`, { state: { from: '/planning' } })
        break
      case 'delete':
        setDialog({ kind: 'delete', meal })
        break
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragState | undefined
    if (data) setDrag(data)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDrag(null)
    const data = event.active.data.current as DragState | undefined
    const target = dropTarget(event.over?.id)
    if (!data || !target) return
    // Élément de la liste déposé sur un créneau : repas pour la personne connectée (modifiable ensuite).
    if ('inbox' in data) {
      if (userId) void planInboxItem(data.inbox, target, [userId])
      return
    }
    if (data.mode === 'move') void planning.moveMeal(data.meal, target)
    else void planning.duplicateMeal(data.meal, target)
  }

  async function planInboxItem(item: InboxItem, target: SlotRef, people: string[]): Promise<boolean> {
    const ok = await inbox.plan(item, target, people)
    if (ok) void planning.reload()
    return ok
  }

  async function submitForm(people: string[], source: MealRecipeSource): Promise<boolean> {
    if (dialog.kind !== 'form') return false
    if (dialog.meal) return planning.updateMeal(dialog.meal.id, people, source)
    return planning.createMeal({ date: dialog.target.date, slot: dialog.target.slot, people, source })
  }

  const closeDialog = () => setDialog({ kind: 'none' })
  const formDialog = dialog.kind === 'form' ? dialog : null
  const deleting = dialog.kind === 'delete' ? dialog.meal : null

  return (
    <>
      <PageHeader
        title="Planning"
        description={formatRange(start, PLANNING_DAYS)}
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-xs">
            <Button variant="ghost" size="icon-lg" aria-label="Semaine précédente" onClick={() => setStart((s) => addDays(s, -PLANNING_DAYS))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" className="h-9 px-3" onClick={() => setStart(today)} disabled={start === today}>
              Aujourd'hui
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Semaine suivante" onClick={() => setStart((s) => addDays(s, PLANNING_DAYS))}>
              <ChevronRight />
            </Button>
          </div>
        }
      />

      {planning.loadError ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{planning.loadError}</p>
          <Button variant="outline" onClick={() => void planning.reload()}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : null}

      {!planning.loadError && (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDrag(null)}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-6">
            <div className="lg:order-last">
              <InboxPanel inbox={inbox} onPlan={(item) => setDialog({ kind: 'plan', item })} onRename={(item) => setDialog({ kind: 'rename', item })} />
            </div>
            {planning.loading ? (
              <div className="grid gap-4" aria-busy="true" aria-label="Chargement du planning">
                {days.slice(0, 3).map((d) => (
                  <Skeleton key={d} className="h-40 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {days.map((date) => (
                  <DayCard
                    key={date}
                    date={date}
                    isToday={date === today}
                    mealsBySlot={mealsBySlot}
                    profiles={profiles}
                    onAdd={(d: IsoDate, slot: MealSlot) => openForm({ date: d, slot }, null)}
                    onAction={handleAction}
                  />
                ))}
              </div>
            )}
          </div>
          <DragOverlay dropAnimation={null}>
            {drag && (
              <div className="flex max-w-xs items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-lg">
                {'inbox' in drag ? (
                  <>
                    <CalendarPlus className="size-4 text-brand" aria-hidden />
                    <span className="text-muted-foreground">Planifier</span>
                    <span className="truncate">{drag.inbox.title}</span>
                  </>
                ) : (
                  <>
                    {drag.mode === 'move' ? <MoveRight className="size-4 text-brand" aria-hidden /> : <Copy className="size-4 text-brand" aria-hidden />}
                    <span className="text-muted-foreground">{drag.mode === 'move' ? 'Déplacement' : 'Copie'}</span>
                    <span className="truncate">{drag.meal.recipe.title}</span>
                  </>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <MealDialog
        open={formDialog !== null}
        onOpenChange={(open) => !open && closeDialog()}
        target={formDialog?.target ?? { date: start, slot: 'LUNCH' }}
        meal={formDialog?.meal ?? null}
        profiles={profiles}
        currentUserId={userId}
        savedRecipes={savedRecipes}
        onSubmit={submitForm}
      />

      <MealTargetDialog
        mode={dialog.kind === 'move' ? 'move' : 'duplicate'}
        meal={dialog.kind === 'move' || dialog.kind === 'duplicate' ? dialog.meal : null}
        days={days}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={(meal, target) => (dialog.kind === 'move' ? planning.moveMeal(meal, target) : planning.duplicateMeal(meal, target))}
      />

      <InboxPlanDialog
        item={dialog.kind === 'plan' ? dialog.item : null}
        days={days}
        profiles={profiles}
        currentUserId={userId}
        onOpenChange={(open) => !open && closeDialog()}
        onSubmit={planInboxItem}
      />

      <InboxRenameDialog item={dialog.kind === 'rename' ? dialog.item : null} onOpenChange={(open) => !open && closeDialog()} onSubmit={inbox.rename} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && closeDialog()}
        title="Supprimer ce repas ?"
        description={
          deleting && (
            <>
              <span className="block font-medium text-foreground">{deleting.recipe.title}</span>
              {formatDay(deleting.meal_date)} · {slotLabel(deleting.slot)} · {peopleLabel(deleting.people, profiles)}
            </>
          )
        }
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleting) await planning.deleteMeal(deleting)
        }}
      />
    </>
  )
}

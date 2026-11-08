import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { BuildInfo } from '@/components/BuildInfo'
import { PageHeader } from '@/components/PageHeader'
import { LoadError } from '@/components/LoadError'
import { LlmUsageSettings } from '@/components/LlmUsageSettings'
import { useSettings } from '@/app/SettingsContext'
import { MealRulesSettings } from '@/modules/repas/components/MealRulesSettings'
import { CONTAINER_NAME_MAX, MAX_CONTAINERS, parseContainers, toContainerDraft, type ContainerDraft, type WaterContainer } from '@/lib/hydration'
import { isPageEnabled, NOTIFICATION_TOPICS, PAGES, parseGoalLiters, toggleNotification, togglePage, MAX_GOAL_ML, MIN_GOAL_ML } from '@/lib/settings'

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const id = `section-${title}`
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Toggle({ id, label, description, checked, disabled, onChange }: { id: string; label: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(c) => onChange(c)} className="mt-0.5 size-5" aria-describedby={`${id}-description`} />
      <div className="min-w-0">
        <Label htmlFor={id} className="font-medium">
          {label}
        </Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </li>
  )
}

const liters = (ml: number) => String(ml / 1000).replace('.', ',')

function GoalForm({ goalMl, onSave }: { goalMl: number; onSave: (ml: number) => Promise<boolean> }) {
  const [value, setValue] = useState(() => liters(goalMl))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const ml = parseGoalLiters(value)
    if (ml === null) return setError(`Entre un objectif entre ${liters(MIN_GOAL_ML)} et ${liters(MAX_GOAL_ML)} L.`)
    setError(null)
    setSaving(true)
    await onSave(ml)
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-2" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="hydration-goal">Objectif par jour (litres)</Label>
        <Input
          id="hydration-goal"
          inputMode="decimal"
          className="h-10 w-28"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? 'hydration-goal-error' : undefined}
        />
      </div>
      <Button type="submit" variant="outline" className="h-10" disabled={saving || parseGoalLiters(value) === goalMl}>
        {saving && <Loader2 className="animate-spin" aria-hidden />}
        Enregistrer
      </Button>
      {error && (
        <p id="hydration-goal-error" role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

function ContainersForm({ containers, onSave }: { containers: WaterContainer[]; onSave: (containers: WaterContainer[]) => Promise<boolean> }) {
  const [drafts, setDrafts] = useState<ContainerDraft[]>(() => containers.map(toContainerDraft))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const parsed = parseContainers(drafts)
  const unchanged = 'containers' in parsed && JSON.stringify(parsed.containers) === JSON.stringify(containers)

  const change = (index: number, patch: Partial<ContainerDraft>) => setDrafts((all) => all.map((d, i) => (i === index ? { ...d, ...patch } : d)))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if ('error' in parsed) return setError(parsed.error)
    setError(null)
    setSaving(true)
    await onSave(parsed.containers)
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2" noValidate aria-label="Contenants">
      <p className="text-sm font-medium">Contenants</p>
      <ul className="space-y-2">
        {drafts.map((draft, index) => (
          <li key={index} className="flex items-end gap-2">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Label htmlFor={`container-name-${index}`} className="sr-only">
                Nom du contenant {index + 1}
              </Label>
              <Input
                id={`container-name-${index}`}
                className="h-10"
                maxLength={CONTAINER_NAME_MAX}
                placeholder="Gourde"
                value={draft.name}
                onChange={(e) => change(index, { name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`container-cl-${index}`} className="sr-only">
                Volume du contenant {index + 1} (cl)
              </Label>
              <div className="flex items-center gap-1.5">
                <Input id={`container-cl-${index}`} inputMode="decimal" className="h-10 w-20" value={draft.cl} onChange={(e) => change(index, { cl: e.target.value })} />
                <span className="text-sm text-muted-foreground">cl</span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              aria-label={`Retirer ${draft.name.trim() || `le contenant ${index + 1}`}`}
              disabled={drafts.length === 1}
              onClick={() => setDrafts((all) => all.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {drafts.length < MAX_CONTAINERS && (
          <Button type="button" variant="ghost" className="h-10" onClick={() => setDrafts((all) => [...all, { name: '', cl: '' }])}>
            <Plus /> Ajouter un contenant
          </Button>
        )}
        <Button type="submit" variant="outline" className="h-10" disabled={saving || unchanged}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer les contenants
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

export function SettingsPage() {
  const { settings, loading, ready, loadError, reload, update, notifications } = useSettings()
  const { status, busy, enable, disable } = notifications

  if (loading) {
    return (
      <>
        <PageHeader title="Réglages" />
        <div className="space-y-3" aria-busy="true" aria-label="Chargement des réglages">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </>
    )
  }

  if (!ready) {
    return (
      <>
        <PageHeader title="Réglages" />
        <LoadError message={loadError ?? 'Réglages indisponibles.'} onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Réglages" description="Tes choix ne changent rien pour l’autre." actions={<BuildInfo />} />
      <div className="space-y-4">
        <Section title="Pages" description="Pages affichées dans la navigation.">
          <ul>
            {PAGES.map((page) => (
              <Toggle
                key={page.key}
                id={`page-${page.key}`}
                label={page.label}
                description={page.description}
                checked={isPageEnabled(settings, page.key)}
                onChange={(checked) => void update(togglePage(settings, page.key, checked))}
              />
            ))}
          </ul>
        </Section>

        <Section title="Notifications" description="Ce que tu reçois sur tes appareils.">
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <p className="min-w-0 flex-1">
              {status === 'on'
                ? 'Activées sur cet appareil.'
                : status === 'denied'
                  ? 'Bloquées par le téléphone. Autorise-les pour Life dans les réglages du téléphone (Applications → Life → Notifications), puis rouvre l’application.'
                  : status === 'off'
                    ? 'Désactivées sur cet appareil.'
                    : status === 'loading'
                      ? 'Vérification…'
                      : 'Disponibles seulement dans l’application installée sur le téléphone.'}
            </p>
            {status === 'off' && (
              <Button className="h-9" onClick={() => void enable()} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Activer sur cet appareil
              </Button>
            )}
            {status === 'on' && (
              <Button variant="outline" className="h-9" onClick={() => void disable()} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Désactiver sur cet appareil
              </Button>
            )}
          </div>
          <ul>
            {NOTIFICATION_TOPICS.map((topic) => {
              const pageOn = isPageEnabled(settings, topic.key)
              return (
                <Toggle
                  key={topic.key}
                  id={`notification-${topic.key}`}
                  label={topic.label}
                  description={pageOn ? topic.description : 'Page désactivée : aucune notification.'}
                  checked={pageOn && !settings.mutedNotifications.includes(topic.key)}
                  disabled={!pageOn}
                  onChange={(checked) => void update(toggleNotification(settings, topic.key, checked))}
                />
              )
            })}
          </ul>
        </Section>

        {isPageEnabled(settings, 'planning') && <MealRulesSettings />}

        {isPageEnabled(settings, 'hydratation') && (
          <Section title="Eau" description="Objectif du jour, et contenants proposés sur la page Eau et dans le rappel (les deux premiers).">
            <div className="space-y-5">
              <GoalForm key={settings.hydrationGoalMl} goalMl={settings.hydrationGoalMl} onSave={(ml) => update({ hydrationGoalMl: ml })} />
              <ContainersForm
                key={JSON.stringify(settings.hydrationContainers)}
                containers={settings.hydrationContainers}
                onSave={(containers) => update({ hydrationContainers: containers })}
              />
            </div>
          </Section>
        )}

        <LlmUsageSettings />
      </div>
    </>
  )
}

import { Loader2, RefreshCw } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/Layout'
import { useSettings } from '@/app/SettingsContext'
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
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{loadError ?? 'Réglages indisponibles.'}</p>
          <Button variant="outline" onClick={reload}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Réglages" description="Tes choix ne changent rien pour l’autre." />
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
                  ? 'Bloquées par le téléphone : autorise-les pour Food dans ses réglages.'
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

        {isPageEnabled(settings, 'hydratation') && (
          <Section title="Eau" description="Petit verre : 20 cl, grand verre : 33 cl.">
            <GoalForm key={settings.hydrationGoalMl} goalMl={settings.hydrationGoalMl} onSave={(ml) => update({ hydrationGoalMl: ml })} />
          </Section>
        )}
      </div>
    </>
  )
}

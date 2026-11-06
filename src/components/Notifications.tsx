import { BellRing, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/app/SettingsContext'
import type { NotificationsState } from '@/hooks/useNotifications'
import { activeTopics, describeTopics, NOTIFICATION_TOPICS } from '@/lib/settings'

const PROMPT_KEY = 'food:notifications-prompt'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(PROMPT_KEY) === 'dismissed'
  } catch {
    return false
  }
}

/** Sujets reçus d'après les réglages (ceux des réglages par défaut tant qu'ils ne sont pas chargés). */
function useTopics() {
  const { ready, settings } = useSettings()
  return ready ? activeTopics(settings) : NOTIFICATION_TOPICS.filter((t) => t.key === 'courses')
}

/** Proposition d'activer les notifications, affichée une fois dans l'application installée. */
export function NotificationsPrompt({ notifications }: { notifications: NotificationsState }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const { status, busy, enable } = notifications
  const topics = useTopics()
  // Rien à proposer : aucune notification choisie dans les réglages.
  if (status !== 'off' || dismissed || topics.length === 0) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(PROMPT_KEY, 'dismissed')
    } catch {
      // Stockage indisponible : la proposition reviendra au prochain lancement.
    }
  }

  return (
    <div role="region" aria-label="Activer les notifications" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/25 bg-brand/5 p-4">
      <BellRing className="size-5 shrink-0 text-brand" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">Activer les notifications ?</span>{' '}
        <span className="text-muted-foreground">Tu seras prévenu(e) : {describeTopics(topics)}.</span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-9" onClick={dismiss}>
          Plus tard
        </Button>
        <Button className="h-9" onClick={() => void enable()} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Activer
        </Button>
      </div>
    </div>
  )
}

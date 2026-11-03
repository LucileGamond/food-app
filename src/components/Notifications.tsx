import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

/** Bouton cloche (en-tête / barre latérale) : état et réglage des notifications de l'application. */
export function NotificationsButton({ notifications, size = 'icon' }: { notifications: NotificationsState; size?: 'icon' | 'icon-lg' }) {
  const topics = useTopics()
  const described = describeTopics(topics)
  const [open, setOpen] = useState(false)
  const { status, busy, enable, disable } = notifications
  // Navigateur sans notifications (ou application non installée) : rien à régler.
  if (status === 'loading' || status === 'unsupported') return null
  const Icon = status === 'on' ? BellRing : status === 'denied' ? BellOff : Bell

  return (
    <>
      <Button variant="ghost" size={size} aria-label="Notifications" onClick={() => setOpen(true)}>
        <Icon className={status === 'on' ? 'text-brand' : undefined} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>
              {status === 'on'
                ? topics.length
                  ? `Activées sur cet appareil : ${described}. Choisis lesquelles recevoir dans les réglages.`
                  : 'Activées sur cet appareil, mais aucune n’est choisie dans les réglages.'
                : status === 'denied'
                  ? 'Bloquées par le téléphone. Autorise-les pour Food dans les réglages du téléphone (Applications → Food → Notifications), puis rouvre l’application.'
                  : topics.length
                    ? `Être prévenu(e) sur cet appareil : ${described} (au choix dans les réglages).`
                    : 'Aucune notification n’est choisie dans les réglages.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            {status === 'off' && (
              <Button className="h-10" onClick={() => void enable()} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Activer
              </Button>
            )}
            {status === 'on' && (
              <Button variant="outline" className="h-10" onClick={() => void disable()} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Désactiver
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
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

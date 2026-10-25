import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NotificationsState } from '@/hooks/useNotifications'

/** Activation, sur cet appareil, des notifications « l'autre a modifié une liste ». */
export function NotificationsCard({ notifications }: { notifications: NotificationsState }) {
  const { status, busy, enable, disable } = notifications
  if (status === 'loading') return null

  if (status === 'unsupported') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <BellOff className="size-3.5" aria-hidden />
        Les notifications sont disponibles depuis l'application installée sur le téléphone.
      </p>
    )
  }

  return (
    <section aria-labelledby="notifications-title" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-background p-4 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10">
        {status === 'on' ? <BellRing className="size-4 text-brand" aria-hidden /> : <Bell className="size-4 text-brand" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="notifications-title" className="text-sm font-medium">
          {status === 'on' ? 'Notifications activées sur cet appareil' : 'Être prévenu(e) quand l’autre modifie une liste'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {status === 'denied'
            ? 'Les notifications sont bloquées : autorise-les pour Food dans les réglages du téléphone (Applications → Food → Notifications), puis recharge la page.'
            : 'Une notification par série de modifications, quelques minutes après la dernière.'}
        </p>
      </div>
      {status === 'off' && (
        <Button className="h-9" onClick={() => void enable()} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Activer sur cet appareil
        </Button>
      )}
      {status === 'on' && (
        <Button variant="outline" className="h-9" onClick={() => void disable()} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Désactiver
        </Button>
      )}
    </section>
  )
}

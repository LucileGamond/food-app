import { CloudOff } from 'lucide-react'

/** Bandeau hors ligne ou avancée en attente d'envoi (rien si tout est envoyé). */
export function OfflineNote({ offline, pending }: { offline: boolean; pending: number }) {
  if (!offline && pending === 0) return null
  return (
    <p role="status" className="flex items-start gap-1.5 rounded-xl bg-muted/50 p-3 text-sm">
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {offline
        ? 'Hors ligne : tu tricotes sur la version gardée sur ce téléphone. Ton avancée sera envoyée au retour du réseau.'
        : 'Avancée en attente d’envoi : elle partira dès que possible.'}
    </p>
  )
}

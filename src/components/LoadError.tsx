import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Chargement en échec : le message et de quoi réessayer. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p>{message}</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw /> Réessayer
      </Button>
    </div>
  )
}

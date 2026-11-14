// Réglages (module Tricot) : relier son compte Ravelry, pour que « Des idées pour ma laine » propose de vrais patrons
// (API de Ravelry, gratuite). Les jetons restent côté serveur ; l'application ne voit que le nom du compte.

import { Link2, Loader2, Unlink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsync } from '@/hooks/useAsync'
import { leaveFor, ravelryRedirectUri } from '../lib/ravelry'

export function RavelrySettings() {
  const api = useApi()
  const account = useAsync(() => api.knitting.getRavelryAccount(), [api])
  const [busy, setBusy] = useState(false)

  async function connect() {
    setBusy(true)
    try {
      leaveFor.go(await api.knitting.startRavelryConnect(ravelryRedirectUri()))
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await api.knitting.disconnectRavelry()
      toast.success('Compte Ravelry délié')
      account.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="section-ravelry" className="rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
      <h2 id="section-ravelry" className="font-medium">
        Ravelry
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Pour que « Des idées pour ma laine » propose de vrais patrons de Ravelry (gratuit).</p>
      {account.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {account.error}
        </p>
      ) : account.data === undefined ? (
        <Skeleton className="mt-3 h-10 rounded-xl" />
      ) : account.data ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm">
            Relié au compte <span className="font-medium">{account.data.username}</span>.
          </p>
          <Button variant="outline" className="h-10" disabled={busy} onClick={() => void disconnect()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Unlink />} Délier
          </Button>
        </div>
      ) : (
        <Button className="mt-3 h-10" disabled={busy} onClick={() => void connect()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 />} Relier mon compte Ravelry
        </Button>
      )}
    </section>
  )
}

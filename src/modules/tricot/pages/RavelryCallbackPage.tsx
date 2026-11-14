// Retour de Ravelry après l'autorisation (/reglages/ravelry?code&state, ou ?error si refusée) : relie le compte puis
// revient aux Réglages.

import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { PageHeader } from '@/components/PageHeader'

export function RavelryCallbackPage() {
  const api = useApi()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const code = params.get('code')
  const state = params.get('state')
  const refused = params.has('error')
  const [error, setError] = useState<string | null>(refused ? 'Connexion à Ravelry annulée.' : !code || !state ? 'Réponse de Ravelry incomplète.' : null)

  // Une seule fois, même si l'effet est rejoué en mode strict (le code ne sert qu'une fois).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || refused || !code || !state) return
    started.current = true
    api.knitting.finishRavelryConnect(code, state).then(
      (username) => {
        toast.success(`Compte Ravelry relié : ${username}`)
        navigate('/reglages', { replace: true })
      },
      (e: unknown) => setError(errorMessage(e)),
    )
  }, [api, code, state, refused, navigate])

  return (
    <>
      <PageHeader title="Ravelry" />
      {error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Link to="/reglages" className="text-sm font-medium text-brand underline-offset-4 hover:underline">
            Retour aux Réglages
          </Link>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Connexion du compte Ravelry…
        </p>
      )}
    </>
  )
}

// Fiche d'une laine : « Chercher sur Ravelry » — marque, nom, composition, poids, métrage et aiguilles remplis depuis
// la base de laines de Ravelry (gratuit, compte Ravelry relié), au lieu de lire l'étiquette avec l'IA.

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAsync } from '@/hooks/useAsync'
import { ravelryYarnDetails, type RavelryYarnHit, type Yarn } from '../lib/yarn'
import { SearchIcon } from './KnitIcons'

export function RavelryYarnSearch({ onPick, disabled = false }: { onPick: (yarn: Yarn) => void; disabled?: boolean }) {
  const api = useApi()
  // Sans compte Ravelry relié (ou s'il est illisible), rien n'est proposé.
  const account = useAsync(() => api.knitting.getRavelryAccount(), [api])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<RavelryYarnHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!account.data) return null

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      setHits(await api.knitting.searchRavelryYarns(query.trim()))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function pick(hit: RavelryYarnHit) {
    setBusy(true)
    setError(null)
    try {
      onPick(await api.knitting.getRavelryYarn(hit.id))
      setHits(null)
      setQuery('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="yarn-ravelry-query">Chercher sur Ravelry</Label>
      <div className="flex gap-2">
        <Input
          id="yarn-ravelry-query"
          className="h-10 min-w-0 flex-1"
          value={query}
          maxLength={100}
          placeholder="drops merino extra fine"
          disabled={disabled || busy}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Entrée cherche, sans enregistrer la laine.
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <Button type="button" variant="outline" className="h-10 shrink-0" disabled={disabled || busy || !query.trim()} onClick={() => void search()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <SearchIcon />} Chercher
        </Button>
      </div>
      {hits !== null &&
        (hits.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucune laine trouvée sur Ravelry.</p>
        ) : (
          <ul aria-label="Laines trouvées sur Ravelry" className="divide-y rounded-xl border">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void pick(hit)}
                >
                  <span className="knit-name block">{hit.name}</span>
                  <span className="text-xs text-muted-foreground">{ravelryYarnDetails(hit)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

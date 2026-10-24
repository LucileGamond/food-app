import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import type { Profile } from '@/lib/meals'
import { cn } from '@/lib/utils'

/** Personne suivie, mémorisée dans l'URL (?profil=…) ; par défaut, la personne connectée. */
export function useProfileParam(): [Profile | null, (id: string) => void] {
  const { profiles, currentProfile } = useAuth()
  const [params, setParams] = useSearchParams()
  const id = params.get('profil')
  const profile = profiles.find((p) => p.id === id) ?? currentProfile ?? profiles[0] ?? null
  const select = (next: string) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        copy.set('profil', next)
        return copy
      },
      { replace: true },
    )
  return [profile, select]
}

export function ProfileSwitch({ profiles, value, onChange }: { profiles: Profile[]; value: string | null; onChange: (id: string) => void }) {
  if (profiles.length < 2) return null
  return (
    <div role="radiogroup" aria-label="Personne" className="inline-flex rounded-lg bg-muted p-0.5">
      {profiles.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            'h-9 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            value === p.id && 'bg-background text-foreground shadow-sm',
          )}
        >
          {p.display_name}
        </button>
      ))}
    </div>
  )
}

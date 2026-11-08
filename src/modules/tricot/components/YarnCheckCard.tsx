import { Loader2, Scale } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { KnitStep } from '../lib/pattern'
import { parseDecimal, yarnTitle, type Yarn } from '../lib/yarn'
import { projectRowsDone, yarnVerdict, type YarnCheck } from '../lib/yarnLeft'

interface Props {
  /** Laine principale du projet (la première). */
  yarn: Yarn | undefined
  steps: KnitStep[]
  check: YarnCheck | null
  /** Renvoie false si l'enregistrement a échoué. */
  onSave: (check: YarnCheck) => Promise<boolean>
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** « Assez de laine pour finir ? » : on pèse ce qui reste de la laine principale, l'appli estime s'il en faut plus. */
export function YarnCheckCard({ yarn, steps, check, onSave }: Props) {
  const id = useId()
  const [grams, setGrams] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const verdict = check ? yarnVerdict(yarn, steps, check) : null

  async function weigh(event: FormEvent) {
    event.preventDefault()
    const value = parseDecimal(grams)
    if (value === null || !Number.isFinite(value) || value < 0 || value > 100_000) return setError('Indique le poids en grammes (ex. 82).')
    setError(null)
    setSaving(true)
    if (await onSave({ grams: value, rowsDone: projectRowsDone(steps), at: new Date().toISOString() })) setGrams('')
    setSaving(false)
  }

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border bg-background p-4 shadow-xs">
      <div>
        <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold">
          <Scale className="size-4 text-muted-foreground" aria-hidden /> Assez de laine pour finir ?
        </h2>
        <p className="text-sm text-muted-foreground">
          Pèse tout ce qui reste{yarn ? ` de ${yarnTitle(yarn)}` : ''} (pelote entamée et pelotes entières) : l’appli compare à ce qu’il reste à tricoter.
        </p>
      </div>

      {verdict && (
        <div
          role="status"
          className={cn(
            'rounded-xl p-3 text-sm',
            verdict.kind === 'estimate' && verdict.status === 'short' ? 'bg-destructive/10' : verdict.kind === 'estimate' && verdict.status === 'tight' ? 'bg-amber-500/10' : 'bg-muted/40',
          )}
        >
          {verdict.kind === 'missing-yarn' && 'Complète la laine du projet : poids et métrage d’une pelote, et nombre de pelotes au départ.'}
          {verdict.kind === 'unknown-rows' && `Le nombre de rangs de ${plural(verdict.steps, 'étape')} n’est pas connu : impossible d’estimer la fin.`}
          {verdict.kind === 'too-early' && 'Tricote encore un peu avant de peser : l’estimation se fait d’après la laine déjà utilisée.'}
          {verdict.kind === 'estimate' && (
            <>
              <p className="font-medium">
                {verdict.status === 'enough' && 'Ça passe.'}
                {verdict.status === 'tight' && 'C’est juste : garde une pelote sous la main.'}
                {verdict.status === 'short' && `Il manque ≈ ${verdict.missingMeters} m, soit ${plural(verdict.missingSkeins, 'pelote')}.`}
              </p>
              <p className="text-muted-foreground">
                ≈ {verdict.metersLeft} m restants · ≈ {verdict.metersNeeded} m pour finir
                {check && ` · pesée à ${check.rowsDone} rangs`}
              </p>
            </>
          )}
        </div>
      )}

      <form onSubmit={(e) => void weigh(e)} className="flex flex-wrap items-end gap-2" noValidate>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-grams`} className="text-sm font-medium">
            Laine restante (g)
          </label>
          <Input id={`${id}-grams`} className="h-10 w-28" inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="82" />
        </div>
        <Button type="submit" variant="outline" className="h-10" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {check ? 'Nouvelle pesée' : 'Estimer'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

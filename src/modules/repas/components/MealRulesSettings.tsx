// Réglages : ma règle pour « Planifier la semaine » (lisible par l'autre, qui planifie aussi pour moi).

import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { keywordsTooLong, MAX_KEYWORDS_CHARS, parseKeywords } from '../lib/presence'

export function MealRulesSettings() {
  const api = useApi()
  const { userId } = useAuth()
  const [atWork, setAtWork] = useState<boolean | null>(null)
  const [keywords, setKeywords] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tooLong, setTooLong] = useState(false)

  const load = useCallback(() => {
    if (!userId) return
    api.weekPlan.getMyRule(userId).then(
      (rule) => {
        setAtWork(rule.weekdayLunchAtWork)
        setKeywords(rule.ignoredKeywords.join(', '))
      },
      (e: unknown) => setError(errorMessage(e)),
    )
  }, [api, userId])

  useEffect(load, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const ignoredKeywords = parseKeywords(keywords)
    // Contrainte de la base : refusé ici avec un message clair plutôt qu'en erreur générique.
    setTooLong(keywordsTooLong(ignoredKeywords))
    if (keywordsTooLong(ignoredKeywords)) return
    setSaving(true)
    try {
      await api.weekPlan.saveMyRule({ weekdayLunchAtWork: atWork ?? false, ignoredKeywords })
      setKeywords(ignoredKeywords.join(', '))
      toast.success('Règles des repas enregistrées')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="section-repas-semaine" className="rounded-2xl border bg-background p-4 shadow-xs sm:p-5">
      <h2 id="section-repas-semaine" className="font-medium">
        Repas de la semaine
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Pour savoir si tu manges à la maison quand on planifie la semaine. L’autre voit tes règles.</p>
      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" className="h-10" onClick={() => {
              setError(null)
              load()
            }}>
            Réessayer
          </Button>
        </div>
      ) : atWork === null ? (
        <Skeleton className="mt-3 h-24 rounded-xl" />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-3 grid gap-4">
          <div className="flex items-start gap-3">
            <Checkbox id="rule-lunch-at-work" checked={atWork} onCheckedChange={(c) => setAtWork(c)} className="mt-0.5 size-5" />
            <Label htmlFor="rule-lunch-at-work" className="font-medium">
              Le midi en semaine, je mange au travail
            </Label>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-keywords">Rendez-vous qui ne m’empêchent pas de manger à la maison</Label>
            <Input
              id="rule-keywords"
              className="h-10"
              placeholder="escalade, yoga"
              value={keywords}
              aria-invalid={tooLong}
              aria-describedby="rule-keywords-help"
              onChange={(e) => setKeywords(e.target.value)}
            />
            <p id="rule-keywords-help" className={tooLong ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {tooLong
                ? `Trop long : ${MAX_KEYWORDS_CHARS} caractères au plus pour l’ensemble des rendez-vous. Raccourcis ou retire-en.`
                : 'Séparés par des virgules. Les autres rendez-vous pendant le repas comptent comme une absence.'}
            </p>
          </div>
          <div>
            <Button type="submit" variant="outline" className="h-10" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Enregistrer mes règles
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

import { Loader2, MessageCircleQuestion, Send } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { errorMessage } from '@/api'
import { useApi } from '@/app/ApiContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Abbreviation } from '../lib/glossary'

interface Props {
  stepTitle: string
  text: string
  /** Rang de l'étape à tricoter, et taille suivie. */
  row: number | null
  size: string
  abbreviations: Abbreviation[]
}

/** « Je ne comprends pas ce rang » : question au modèle, avec le texte de l'étape, la taille et le rang en contexte. */
export function StepQuestion({ stepTitle, text, row, size, abbreviations }: Props) {
  const api = useApi()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ question: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ask(event: FormEvent) {
    event.preventDefault()
    const q = question.trim()
    if (!q) return setError('Écris ta question.')
    setError(null)
    setAsking(true)
    try {
      setAnswer({ question: q, text: await api.knitting.askAboutStep({ question: q, stepTitle, text, row, size, abbreviations }) })
      setQuestion('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setAsking(false)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" className="h-10 text-muted-foreground" onClick={() => setOpen(true)}>
        <MessageCircleQuestion /> Une question sur ce rang ?
      </Button>
    )
  }
  return (
    <section aria-label="Question sur ce rang" className="space-y-2 rounded-xl border p-3">
      {answer && (
        <div role="status" className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
          <p className="font-medium">{answer.question}</p>
          <p className="whitespace-pre-line">{answer.text}</p>
        </div>
      )}
      <form onSubmit={(e) => void ask(e)} className="space-y-2" noValidate>
        <label htmlFor={id} className="text-sm font-medium">
          {row !== null ? `Ta question sur le rang ${row}` : 'Ta question sur cette étape'}
        </label>
        <Textarea id={id} value={question} maxLength={500} placeholder="Que veut dire « ssk » ? Combien de mailles à la fin du rang ?" onChange={(e) => setQuestion(e.target.value)} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10" disabled={asking}>
            {asking ? <Loader2 className="animate-spin" aria-hidden /> : <Send />}
            {asking ? 'Réflexion…' : 'Demander'}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </div>
      </form>
    </section>
  )
}

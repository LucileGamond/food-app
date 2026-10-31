import { Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoiceControl } from '@/hooks/useVoiceControl'
import type { useTimers } from '@/hooks/useTimers'
import { toggle, type CookingProgress } from '@/lib/cooking'
import type { Ingredient } from '@/lib/recipes'
import { findDurations, formatTimerDuration, isRinging, remainingMs, stepTimerId } from '@/lib/timers'
import { parseCommand, spokenDuration, spokenIngredients, VOICE_HELP } from '@/lib/voice'
import { cn } from '@/lib/utils'

interface Props {
  steps: string[]
  progress: CookingProgress
  ingredients: Ingredient[]
  timers: ReturnType<typeof useTimers>
  onUpdate: (next: CookingProgress) => void
}

const DONE = 'Toutes les étapes sont faites. Bon appétit !'

/** Mode vocal du mode cuisine : commandes à la voix (étapes, ingrédients, minuteurs) et réponses lues à voix haute. */
export function VoiceControl({ steps, progress, ingredients, timers, onUpdate }: Props) {
  const voice = useVoiceControl(handle)
  if (!voice.supported) return null

  const current = steps.findIndex((_, i) => !progress.steps.includes(i))
  const stepText = (i: number) => `Étape ${i + 1}. ${steps[i]}`
  const currentText = () => (steps.length === 0 ? 'Aucune étape renseignée.' : current === -1 ? DONE : stepText(current))

  function handle(text: string) {
    const command = parseCommand(text)
    if (!command) return
    const now = Date.now()
    switch (command) {
      case 'next': {
        if (current === -1) return voice.speak(currentText())
        onUpdate({ ...progress, steps: toggle(progress.steps, current) })
        const next = steps.findIndex((_, i) => i !== current && !progress.steps.includes(i))
        return voice.speak(next === -1 ? DONE : stepText(next))
      }
      case 'previous': {
        const before = progress.steps.filter((i) => i < (current === -1 ? steps.length : current))
        const previous = before.length ? Math.max(...before) : null
        if (previous === null) return voice.speak(steps.length ? `C’est la première étape. ${stepText(0)}` : currentText())
        onUpdate({ ...progress, steps: toggle(progress.steps, previous) })
        return voice.speak(stepText(previous))
      }
      case 'repeat':
        return voice.speak(currentText())
      case 'ingredients':
        return voice.speak(spokenIngredients(ingredients))
      case 'timer': {
        const duration = current === -1 ? undefined : findDurations(steps[current]!)[0]
        if (!duration) return voice.speak('Pas de durée dans cette étape. Utilise le bouton minuteur.')
        timers.start(stepTimerId(current, duration.start), `Étape ${current + 1} · ${formatTimerDuration(duration.seconds)}`, duration.seconds)
        return voice.speak(`Minuteur de ${spokenDuration(duration.seconds * 1000)} lancé.`)
      }
      case 'pause': {
        const running = timers.timers.filter((t) => t.endsAt !== null && !isRinging(t, now))
        running.forEach((t) => timers.pause(t.id))
        return voice.speak(running.length ? 'Minuteur en pause.' : 'Aucun minuteur en cours.')
      }
      case 'resume': {
        const paused = timers.timers.filter((t) => t.endsAt === null)
        paused.forEach((t) => timers.resume(t.id))
        return voice.speak(paused.length ? 'Minuteur relancé.' : 'Aucun minuteur en pause.')
      }
      case 'remaining': {
        if (timers.timers.length === 0) return voice.speak('Aucun minuteur.')
        return voice.speak(
          timers.timers
            .map((t) => `${t.label.replace(' · ', ', ')} : ${isRinging(t, now) ? 'c’est prêt' : `il reste ${spokenDuration(remainingMs(t, now))}`}`)
            .join('. '),
        )
      }
      case 'stop': {
        const ringing = timers.timers.filter((t) => isRinging(t, now))
        ringing.forEach((t) => timers.remove(t.id))
        return voice.speak(ringing.length ? 'Minuteur arrêté.' : 'D’accord.')
      }
      case 'help':
        return voice.speak(VOICE_HELP)
    }
  }

  function toggleVoice() {
    if (voice.active) return voice.stop()
    voice.start()
    voice.speak(`Mode vocal activé. ${currentText()}`)
  }

  const message =
    voice.status === 'denied'
      ? 'Micro refusé : autorise-le dans les réglages du navigateur pour ce site.'
      : voice.status === 'error'
        ? 'La reconnaissance vocale ne répond pas. Vérifie la connexion, puis réessaie.'
        : voice.status === 'speaking'
          ? 'Lecture…'
          : voice.status === 'listening'
            ? `J’écoute. Dis « suivant », « répète », « ingrédients », « lance le minuteur »…${voice.heard ? ` Entendu : « ${voice.heard} »` : ''}`
            : 'Avance dans la recette à la voix, les mains libres.'

  return (
    <section aria-label="Mode vocal" className={cn('flex items-center gap-3 rounded-2xl border p-3', voice.active ? 'border-brand bg-brand/5' : 'bg-background')}>
      <Button
        variant={voice.active ? 'default' : 'outline'}
        size="icon-lg"
        aria-pressed={voice.active}
        aria-label={voice.active ? 'Couper le mode vocal' : 'Activer le mode vocal'}
        onClick={toggleVoice}
        className="shrink-0"
      >
        {voice.active ? <Mic /> : <MicOff />}
      </Button>
      <div className="min-w-0 text-sm">
        <p className="font-medium">Mode vocal</p>
        <p className={cn('break-words', voice.status === 'denied' || voice.status === 'error' ? 'text-destructive' : 'text-muted-foreground')} aria-live="polite">
          {message}
        </p>
      </div>
    </section>
  )
}

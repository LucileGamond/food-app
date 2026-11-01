import { useCallback, useEffect, useRef, useState } from 'react'

/** Ce qu'on utilise de l'API Web Speech (reconnaissance) : `SpeechRecognition`, préfixée `webkit` dans Chrome. */
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  const w = window as Window & { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type VoiceStatus = 'off' | 'listening' | 'speaking' | 'denied' | 'error'

/** Après la lecture, la reconnaissance rend encore la fin de la voix du téléphone pendant un court instant. */
const ECHO_MS = 800

/**
 * Écoute en continu (reconnaissance vocale du navigateur, en français) et lecture à voix haute.
 * Le navigateur coupe l'écoute après un silence : elle est relancée tant qu'elle est activée. Pendant la lecture, le
 * micro reste ouvert mais ce qu'il entend est ignoré (la voix du téléphone n'est pas une commande) : couper puis
 * relancer l'écoute à chaque phrase échoue souvent sur Chrome Android (« déjà démarrée ») et fait biper le téléphone.
 */
export function useVoiceControl(onHeard: (text: string) => void) {
  const Ctor = recognitionClass()
  const supported = Ctor !== null
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [heard, setHeard] = useState('')
  const enabled = useRef(false)
  const speaking = useRef(false)
  /** Fin de la dernière lecture : les phrases reconnues juste après sont encore la voix du téléphone. */
  const spokeUntil = useRef(0)
  const recognition = useRef<Recognition | null>(null)
  const latest = useRef(onHeard)

  useEffect(() => {
    latest.current = onHeard
  })

  const listen = useCallback(() => {
    if (!enabled.current || !recognition.current) return
    try {
      recognition.current.start()
    } catch {
      // Déjà démarrée : elle écoute, rien à faire.
    }
  }, [])

  const stop = useCallback(() => {
    enabled.current = false
    recognition.current?.abort()
    recognition.current = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    speaking.current = false
    setStatus('off')
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    const r = new Ctor()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = false
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        if (!result.isFinal) continue
        const text = result[0]?.transcript.trim() ?? ''
        if (!text || speaking.current || Date.now() < spokeUntil.current) continue
        setHeard(text)
        latest.current(text)
      }
    }
    r.onerror = (event) => {
      // Micro refusé : inutile d'insister. Silence ou coupure réseau : la relance s'en charge.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        enabled.current = false
        setStatus('denied')
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setStatus('error')
      }
    }
    r.onend = () => {
      if (enabled.current) window.setTimeout(listen, 250)
    }
    recognition.current = r
    enabled.current = true
    setHeard('')
    setStatus('listening')
    listen()
  }, [Ctor, listen])

  /** Lit un texte à voix haute (voix française) ; ce que le micro entend pendant ce temps est ignoré. */
  const speak = useCallback(
    (text: string) => {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      // Chrome sur Android ne signale pas toujours la fin de la lecture : reprise de secours après la durée estimée
      // (environ 15 caractères par seconde, plus une marge), une seule fois.
      let resumed = false
      const fallback = window.setTimeout(() => resume(), 2000 + text.length * 70)
      const resume = () => {
        if (resumed) return
        resumed = true
        window.clearTimeout(fallback)
        speaking.current = false
        spokeUntil.current = Date.now() + ECHO_MS
        if (enabled.current) setStatus((current) => (current === 'speaking' ? 'listening' : current))
      }
      utterance.onend = resume
      utterance.onerror = resume
      speaking.current = true
      if (enabled.current) setStatus((current) => (current === 'listening' || current === 'speaking' ? 'speaking' : current))
      speechSynthesis.speak(utterance)
      // Autre défaut de Chrome : la synthèse peut rester en pause après un passage en arrière-plan.
      speechSynthesis.resume?.()
    },
    [],
  )

  // Écran quitté : micro et voix coupés.
  useEffect(() => stop, [stop])

  return { supported, status, heard, start, stop, speak, active: status === 'listening' || status === 'speaking' }
}

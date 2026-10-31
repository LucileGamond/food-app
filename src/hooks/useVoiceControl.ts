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

/**
 * Écoute en continu (reconnaissance vocale du navigateur, en français) et lecture à voix haute.
 * Le navigateur coupe l'écoute après un silence : elle est relancée tant qu'elle est activée. Pendant la lecture,
 * l'écoute est suspendue pour ne pas prendre la voix du téléphone pour une commande.
 */
export function useVoiceControl(onHeard: (text: string) => void) {
  const Ctor = recognitionClass()
  const supported = Ctor !== null
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [heard, setHeard] = useState('')
  const enabled = useRef(false)
  const speaking = useRef(false)
  const recognition = useRef<Recognition | null>(null)
  const latest = useRef(onHeard)

  useEffect(() => {
    latest.current = onHeard
  })

  const listen = useCallback(() => {
    if (!enabled.current || speaking.current || !recognition.current) return
    try {
      recognition.current.start()
      setStatus('listening')
    } catch {
      // Déjà démarrée : rien à faire.
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
        if (!text) continue
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
      if (enabled.current && !speaking.current) window.setTimeout(listen, 250)
    }
    recognition.current = r
    enabled.current = true
    setHeard('')
    listen()
  }, [Ctor, listen])

  /** Lit un texte à voix haute (voix française), écoute suspendue le temps de la lecture. */
  const speak = useCallback(
    (text: string) => {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      const resume = () => {
        speaking.current = false
        if (enabled.current) listen()
      }
      utterance.onend = resume
      utterance.onerror = resume
      speaking.current = true
      if (enabled.current) setStatus('speaking')
      recognition.current?.abort()
      speechSynthesis.speak(utterance)
    },
    [listen],
  )

  // Écran quitté : micro et voix coupés.
  useEffect(() => stop, [stop])

  return { supported, status, heard, start, stop, speak, active: status === 'listening' || status === 'speaking' }
}

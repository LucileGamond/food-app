import { useCallback, useEffect, useRef, useState } from 'react'
import { addMinute, isRinging, parseTimers, pauseTimer, resumeTimer, startTimer, type Timer } from '@/lib/timers'

/** Durée maximale de la sonnerie d'un minuteur oublié. */
const RING_MS = 2 * 60_000

function load(key: string): Timer[] {
  try {
    return parseTimers(localStorage.getItem(key))
  } catch {
    return []
  }
}

function store(key: string, timers: Timer[]) {
  try {
    if (timers.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(timers))
  } catch {
    // Stockage indisponible (navigation privée) : les minuteurs ne survivront pas au rechargement.
  }
}

type AudioContextClass = typeof AudioContext
let audio: AudioContext | null = null

/** Contexte audio créé au premier minuteur lancé (un clic) : sans geste, le navigateur bloquerait le son. */
function unlockAudio() {
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextClass }).webkitAudioContext
  if (!Ctor) return
  try {
    audio ??= new Ctor()
    void audio.resume().catch(() => undefined)
  } catch {
    audio = null
  }
}

/** Trois bips courts. */
function beep() {
  if (!audio) return
  try {
    const start = audio.currentTime
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, start + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.25 + 0.18)
      osc.connect(gain).connect(audio.destination)
      osc.start(start + i * 0.25)
      osc.stop(start + i * 0.25 + 0.2)
    }
  } catch {
    // Son indisponible : la vibration et l'affichage suffisent.
  }
}

/** Notification si l'appli n'est pas à l'écran (autorisation déjà donnée pour les rappels ; jamais demandée ici). */
function notify(timer: Timer) {
  if (document.visibilityState === 'visible' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const body = `${timer.label} : c’est prêt !`
  const options = { body, tag: `minuteur-${timer.id}` }
  void navigator.serviceWorker
    ?.getRegistration()
    .then((registration) => {
      if (registration) return registration.showNotification('Minuteur terminé', options)
      new Notification('Minuteur terminé', options)
    })
    .catch(() => undefined)
}

/**
 * Minuteurs d'une recette en cours, gardés dans le navigateur (heure de fin) : ils continuent pendant un rechargement.
 * Un minuteur terminé sonne (bips, vibration, notification si l'appli est en arrière-plan) jusqu'à ce qu'on l'arrête.
 */
export function useTimers(recipeId: string) {
  const key = `food-app:minuteurs:${recipeId}`
  const [timers, setTimers] = useState<Timer[]>(() => load(key))
  const [now, setNow] = useState(() => Date.now())
  const alerted = useRef(new Set<string>())

  useEffect(() => store(key, timers), [key, timers])

  const running = timers.some((t) => t.endsAt !== null)
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 250)
    // Retour sur l'appli (écran rallumé) : mise à jour immédiate.
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running])

  const ringing = timers.filter((t) => isRinging(t, now))
  // Sonnerie : une fois par seconde environ, pendant deux minutes au plus après la fin.
  const ringingKey = ringing.map((t) => t.id).join(',')
  useEffect(() => {
    if (!ringingKey) return
    const ids = ringingKey.split(',')
    for (const timer of timers) {
      if (!ids.includes(timer.id) || alerted.current.has(timer.id)) continue
      alerted.current.add(timer.id)
      notify(timer)
    }
    const ring = () => {
      const fresh = timers.some((t) => ids.includes(t.id) && t.endsAt !== null && Date.now() - t.endsAt < RING_MS)
      if (!fresh) return
      beep()
      navigator.vibrate?.([300, 150, 300])
    }
    ring()
    const interval = window.setInterval(ring, 1500)
    return () => window.clearInterval(interval)
  }, [ringingKey, timers])

  const update = useCallback((id: string, change: (timer: Timer, at: number) => Timer) => {
    const at = Date.now()
    setNow(at)
    setTimers((list) => list.map((t) => (t.id === id ? change(t, at) : t)))
  }, [])

  const start = useCallback((id: string, label: string, seconds: number) => {
    unlockAudio()
    const at = Date.now()
    setNow(at)
    setTimers((list) => (list.some((t) => t.id === id) ? list : [...list, startTimer(id, label, seconds, at)]))
  }, [])

  const remove = useCallback((id: string) => {
    alerted.current.delete(id)
    setTimers((list) => list.filter((t) => t.id !== id))
  }, [])

  return {
    timers,
    now,
    start,
    remove,
    pause: useCallback((id: string) => update(id, pauseTimer), [update]),
    resume: useCallback((id: string) => update(id, resumeTimer), [update]),
    addMinute: useCallback(
      (id: string) => {
        alerted.current.delete(id)
        update(id, addMinute)
      },
      [update],
    ),
    clear: useCallback(() => {
      alerted.current.clear()
      setTimers([])
    }, []),
  }
}

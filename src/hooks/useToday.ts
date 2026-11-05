import { useEffect, useState } from 'react'
import { todayIso, type IsoDate } from '@/lib/dates'

/**
 * Date du jour, tenue à jour : l'application installée reste ouverte en arrière-plan et peut revenir
 * au premier plan le lendemain. `fixed` (tests) impose la date ; `current` la calcule (jour de l'appareil par défaut).
 */
export function useToday(fixed?: IsoDate, current: () => IsoDate = todayIso): IsoDate {
  const [today, setToday] = useState<IsoDate>(() => fixed ?? current())

  useEffect(() => {
    if (fixed) return
    const refresh = () => setToday(current())
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [fixed, current])

  return fixed ?? today
}

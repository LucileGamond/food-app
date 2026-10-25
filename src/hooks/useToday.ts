import { useEffect, useState } from 'react'
import { todayIso, type IsoDate } from '@/lib/dates'

/**
 * Date du jour, tenue à jour : l'application installée reste ouverte en arrière-plan et peut revenir
 * au premier plan le lendemain. `fixed` (tests) impose la date.
 */
export function useToday(fixed?: IsoDate): IsoDate {
  const [today, setToday] = useState<IsoDate>(() => fixed ?? todayIso())

  useEffect(() => {
    if (fixed) return
    const refresh = () => setToday(todayIso())
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [fixed])

  return fixed ?? today
}

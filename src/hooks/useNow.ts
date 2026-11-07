import { useEffect, useState } from 'react'

/** Heure courante, rafraîchie chaque minute (« il y a 2 h 10 »). `fixed` (tests) l'impose. */
export function useNow(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date())
  useEffect(() => {
    if (fixed) return
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [fixed])
  return fixed ?? now
}

import { useEffect, useRef } from 'react'

/** Durée de la vibration (ms) : courte, pour prévenir sans surprendre. */
export const ROW_VIBRATION_MS = 200

/** Vibre en arrivant (en comptant, pas en décomptant) sur un rang où il y a quelque chose à faire, si le téléphone le permet. */
export function useRowVibration(row: number, notable: boolean): void {
  const previous = useRef(row)
  useEffect(() => {
    if (row > previous.current && notable) navigator.vibrate?.(ROW_VIBRATION_MS)
    previous.current = row
  }, [row, notable])
}

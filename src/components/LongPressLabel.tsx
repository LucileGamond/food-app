import { useEffect, useRef, useState } from 'react'

/** Durée d'appui pour montrer le nom (ms), déplacement toléré (px) et durée d'affichage (ms). */
export const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 10
const SHOWN_MS = 1800

/**
 * Bouton ou lien qui n'a qu'une icône : son nom (aria-label) n'est pas écrit. Le texte affiché, sans ce qui est réservé
 * au lecteur d'écran, est vide.
 */
export function iconOnlyLabel(target: EventTarget | null): { element: HTMLElement; label: string } | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>('button[aria-label], a[aria-label], [role="button"][aria-label]')
  if (!element) return null
  const label = element.getAttribute('aria-label')?.trim()
  if (!label) return null
  const visible = Array.from(element.childNodes)
    .map((node) => (node instanceof HTMLElement && node.classList.contains('sr-only') ? '' : (node.textContent ?? '')))
    .join('')
    .trim()
  return visible ? null : { element, label }
}

/**
 * Appui long sur un bouton à icône seule : son nom s'affiche dans une petite bulle au-dessus, comme sur Android
 * (au toucher, il n'y a pas de survol pour une info-bulle). Un bonus : le nom reste lu par le lecteur d'écran et, quand
 * il faut expliquer, une bulle d'aide « ? » s'ouvre d'un toucher. Le relâcher ne déclenche pas le bouton.
 */
export function LongPressLabel() {
  const [shown, setShown] = useState<{ label: string; x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  // Après un appui long, le « click » qui suit le relâcher est avalé.
  const swallowUntil = useRef(0)

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      start.current = null
    }
    const onDown = (event: PointerEvent) => {
      setShown(null)
      if (event.pointerType === 'mouse') return
      const found = iconOnlyLabel(event.target)
      if (!found) return
      start.current = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        const box = found.element.getBoundingClientRect()
        setShown({ label: found.label, x: box.left + box.width / 2, y: box.top })
        swallowUntil.current = Date.now() + 800
        timer.current = null
      }, LONG_PRESS_MS)
    }
    const onMove = (event: PointerEvent) => {
      if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > MOVE_TOLERANCE) clear()
    }
    const onClick = (event: MouseEvent) => {
      if (Date.now() < swallowUntil.current) {
        event.preventDefault()
        event.stopPropagation()
        swallowUntil.current = 0
      }
    }
    // Le menu contextuel du navigateur (lien) ne vient pas couvrir la bulle.
    const onContextMenu = (event: MouseEvent) => {
      if (iconOnlyLabel(event.target) && (timer.current !== null || Date.now() < swallowUntil.current)) event.preventDefault()
    }
    const hide = () => setShown(null)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', clear, true)
    document.addEventListener('pointercancel', clear, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    window.addEventListener('scroll', hide, true)
    return () => {
      clear()
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', clear, true)
      document.removeEventListener('pointercancel', clear, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  useEffect(() => {
    if (!shown) return
    const id = window.setTimeout(() => setShown(null), SHOWN_MS)
    return () => window.clearTimeout(id)
  }, [shown])

  if (!shown) return null
  return (
    // Le nom est déjà lu par le lecteur d'écran (aria-label) : la bulle est pour l'œil.
    <div
      aria-hidden
      data-testid="long-press-label"
      className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2.5 py-1 text-sm whitespace-nowrap text-background shadow-md"
      style={{ left: Math.min(Math.max(shown.x, 60), window.innerWidth - 60), top: Math.max(shown.y - 8, 40) }}
    >
      {shown.label}
    </div>
  )
}

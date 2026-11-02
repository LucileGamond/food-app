import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { actionEffect, sectionLines, type PlannedSection } from '../lib/pattern'

/** Durée d'appui pour décocher une pastille. */
export const LONG_PRESS_MS = 500

const EFFECT_BORDER = {
  decrease: 'border-red-500',
  increase: 'border-blue-500',
  other: 'border-amber-500',
} as const

function Dot({ row, label, checked, next, border, onCount }: { row: number; label: string; checked: boolean; next: boolean; border: string | null; onCount: (delta: number) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressed = useRef(false)

  const cancel = () => clearTimeout(timer.current)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      data-row={row}
      // Appui long sur une pastille cochée : un rang de moins.
      onPointerDown={() => {
        pressed.current = false
        if (!checked) return
        timer.current = setTimeout(() => {
          pressed.current = true
          navigator.vibrate?.(30)
          onCount(-1)
        }, LONG_PRESS_MS)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (pressed.current) return
        if (!checked) onCount(1)
      }}
      className={cn(
        'size-7 shrink-0 touch-manipulation rounded-full border-2 transition-colors select-none',
        border ? cn(border, 'border-[3px]') : 'border-muted-foreground/40',
        checked ? 'bg-brand' : 'bg-background',
        next && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
      )}
    />
  )
}

/** Pastilles d'une section : une par rang (une ligne par fois pour une répétition), à cocher en tricotant. */
export function RowDots({ planned, rowCount, onCount }: { planned: PlannedSection; rowCount: number; onCount: (delta: number) => void }) {
  const lines = sectionLines(planned, rowCount + 1)
  if (lines.length === 0) return null
  const { section } = planned

  return (
    <div className="mt-2 space-y-1.5">
      {lines.map((line, i) => (
        <div key={line.rows[0]} className="flex items-center gap-2">
          {section.kind === 'repeat' && (
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums" aria-hidden>
              {i + 1}
              {section.times !== null && `/${section.times}`}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5">
            {line.rows.map((r) => {
              const actions = line.actions.get(r) ?? []
              return (
                <Dot
                  key={r}
                  row={r}
                  label={`Rang ${r}${actions.length ? ` : ${actions.map((a) => a.text).join(', ')}` : ''}`}
                  checked={r <= rowCount}
                  next={r === rowCount + 1}
                  border={actions.length ? EFFECT_BORDER[actionEffect(actions[0]!.text)] : null}
                  onCount={onCount}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
